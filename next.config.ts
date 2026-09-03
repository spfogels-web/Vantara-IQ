import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Company marks live in Vercel Blob, uploaded through Settings.
     *
     * Allowing the host here is what lets next/image resize them. The
     * Fortitude logo is a 2.5 MB PNG being drawn 48 pixels tall — served
     * raw, the public SMS page a carrier reviews costs two and a half
     * megabytes to open, and on a phone the logo may simply not arrive.
     */
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  experimental: {
    // Uploads (maps, contracts, rate sheets, docs) post their bytes through
    // Server Actions; the default 1 MB cap is far too small for a map PDF.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
