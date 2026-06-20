// All LLM reasoning in this app goes through Gemini and only Gemini — no other
// model provider is used anywhere in the pipeline. Verified against the installed
// @google/genai v2.9.0 SDK (node_modules/@google/genai/dist/node/node.d.ts) for
// exact field names: responseMimeType/responseSchema, the Type enum, and the
// createUserContent/inlineData helpers for image input.

import { GoogleGenAI, Type, createUserContent } from "@google/genai";
import type { EvidenceCard, ParsedInput, Verdict } from "./types";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Get one at https://aistudio.google.com/apikey and add it to .env.local"
    );
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Turn whatever the user pasted (a URL, a phone number, or "address + rent")
 * into a structured shape the rest of the pipeline can branch on. This replaces
 * writing a pile of brittle regexes by hand with one Gemini call.
 */
export async function parseFreeformInput(raw: string): Promise<ParsedInput> {
  const ai = client();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `A flat-hunter in India pasted this into a rental-fraud checker. Classify it and
extract whatever structured fields you can. Input:\n\n"""${raw}"""`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, enum: ["url", "phone", "address"] },
          url: { type: Type.STRING, nullable: true },
          phone: { type: Type.STRING, nullable: true, description: "Normalized to +91XXXXXXXXXX if Indian" },
          address: { type: Type.STRING, nullable: true },
          rent: { type: Type.NUMBER, nullable: true },
          city: { type: Type.STRING, nullable: true },
        },
        required: ["kind"],
      },
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as Partial<ParsedInput>;
  return { raw, kind: parsed.kind ?? "address", ...parsed };
}

/**
 * The "Verdict Engine": feed every piece of evidence we actually collected
 * (never anything we didn't) and ask Gemini to reason about it. The schema
 * forces a structured, checkable answer instead of free text.
 */
export async function synthesizeVerdict(
  listingContext: string,
  evidence: EvidenceCard[]
): Promise<Verdict> {
  const ai = client();

  const evidenceBlock = evidence
    .map(
      (e, i) =>
        `[${i + 1}] (${e.source}) ${e.title} — status: ${e.status}\n${e.summary}`
    )
    .join("\n\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are the verdict engine for LeaseOrLeave, a tool that protects Indian renters
from token-deposit rental scams. You are given (a) what the user is looking at, and
(b) a list of evidence cards from real checks that were actually run — Reddit scam-report
search, Airbnb cross-listing check, generic web search, and/or a scrape of the listing
page itself. Some checks may be marked "skipped" or "failed" because the underlying data
source genuinely wasn't available — treat those as missing information, NOT as red flags,
and say so plainly if there isn't enough evidence either way.

Do not invent facts that are not present in the evidence below. If the evidence is thin,
return verdict "INCONCLUSIVE" and say what's missing rather than guessing.

LISTING CONTEXT:
${listingContext}

EVIDENCE:
${evidenceBlock || "(no evidence could be collected)"}
`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          verdict: { type: Type.STRING, enum: ["LOW_RISK", "MEDIUM_RISK", "HIGH_RISK", "INCONCLUSIVE"] },
          confidence: { type: Type.NUMBER, description: "0-100" },
          risk_score: { type: Type.NUMBER, description: "0-100" },
          summary: { type: Type.STRING },
          red_flags: { type: Type.ARRAY, items: { type: Type.STRING } },
          green_flags: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommended_action: { type: Type.STRING },
        },
        required: ["verdict", "confidence", "risk_score", "summary", "red_flags", "green_flags", "recommended_action"],
      },
    },
  });

  return JSON.parse(response.text ?? "{}") as Verdict;
}

/**
 * Real photo-duplication check using Gemini's vision input — NOT a fake "reverse
 * image search". We don't have a confirmed reverse-image-search action anywhere
 * in Anakin's catalog, so instead of pretending we ran one, we do the thing we
 * can actually do: fetch the candidate photos ourselves and ask Gemini to look
 * at them side by side. This only runs when the orchestrator has found a second
 * candidate listing with its own photos to compare against (see orchestrator.ts);
 * it cannot tell you a photo was "stolen from the internet" in general, only
 * whether two specific photo sets you hand it look like the same property.
 */
export async function comparePhotosForDuplication(
  listingPhotoUrls: string[],
  candidatePhotoUrls: string[]
): Promise<{ likelySameProperty: boolean; reasoning: string }> {
  if (listingPhotoUrls.length === 0 || candidatePhotoUrls.length === 0) {
    return { likelySameProperty: false, reasoning: "Not enough photos on one side to compare." };
  }

  const ai = client();
  const fetchAsPart = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { inlineData: { data: buf.toString("base64"), mimeType: contentType } };
  };

  const listingParts = (
    await Promise.all(listingPhotoUrls.slice(0, 3).map(fetchAsPart))
  ).filter((p): p is NonNullable<typeof p> => p !== null);
  const candidateParts = (
    await Promise.all(candidatePhotoUrls.slice(0, 3).map(fetchAsPart))
  ).filter((p): p is NonNullable<typeof p> => p !== null);

  if (listingParts.length === 0 || candidateParts.length === 0) {
    return { likelySameProperty: false, reasoning: "Could not download photos from one or both listings." };
  }

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: createUserContent([
      "Set A is photos from the listing the user is checking. Set B is photos from a " +
        "different listing found elsewhere. Do Set A and Set B show the same physical " +
        "property (same room, same fixtures, same view) — i.e. is this a duplicated/" +
        "cloned listing? Be conservative: only say yes if you're genuinely confident.",
      "--- Set A ---",
      ...listingParts,
      "--- Set B ---",
      ...candidateParts,
    ]),
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          likelySameProperty: { type: Type.BOOLEAN },
          reasoning: { type: Type.STRING },
        },
        required: ["likelySameProperty", "reasoning"],
      },
    },
  });

  return JSON.parse(response.text ?? "{}") as { likelySameProperty: boolean; reasoning: string };
}
