import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "16mb" },
  },
  // PDFKit loads font metrics relative to its installed package at runtime.
  serverExternalPackages: ["pdfkit"],
  allowedDevOrigins: ["localhost", "127.0.0.1", "127.94.0.1"],
};

export default nextConfig;
