import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Uploads (maps, contracts, rate sheets, docs) post their bytes through
    // Server Actions; the default 1 MB cap is far too small for a map PDF.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
