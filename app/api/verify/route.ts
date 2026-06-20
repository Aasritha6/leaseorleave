import { runVerification } from "@/lib/orchestrator";
import type { StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { input } = (await req.json()) as { input?: string };
  if (!input || input.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Missing input" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await runVerification(input, emit);
      } catch (err) {
        emit({ type: "error", data: { message: (err as Error).message } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
