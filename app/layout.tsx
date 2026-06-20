import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono, Courier_Prime } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});
const courierPrime = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-courier",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LeaseOrLeave — Rental Fraud Shield for India",
  description:
    "AI-powered rental fraud detection. Paste a listing URL, broker phone number, or address — LeaseOrLeave cross-checks it against scam reports, Airbnb, Square Yards, and the open web before you pay a token deposit.",
  keywords: [
    "rental fraud",
    "India",
    "NoBroker",
    "MagicBricks",
    "token deposit scam",
    "flat hunting",
    "rental scam checker",
    "Gemini AI",
  ],
  openGraph: {
    title: "LeaseOrLeave — Don't Pay a Token Before You Check",
    description:
      "AI-powered rental fraud shield for Indian flat-hunters. Real checks, real evidence, no fake results.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${plexMono.variable} ${courierPrime.variable}`}
        style={{ fontFamily: "var(--font-inter, system-ui, sans-serif)" }}
      >
        {children}
      </body>
    </html>
  );
}
