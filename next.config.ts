import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Listing photos come from arbitrary third-party domains (NoBroker, MagicBricks,
  // Facebook CDN, etc.) discovered at request time, so we can't whitelist a fixed
  // set of image hosts up front. We proxy/inline the few photos we actually display
  // (see lib/anakin.ts) rather than rendering remote <img src> directly, so this
  // stays empty on purpose.
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
