import type { NextConfig } from "next";

// Header keamanan dasar untuk semua response (Tahap 10.4).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Image produksi hanya berisi `.next/standalone` (Dockerfile, Tahap 10.5).
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Default 1 MB. Upload file maks 5 MB (MAX_UPLOAD_MB) + overhead multipart.
      // Satu request = satu file; form dengan banyak lampiran meng-upload per file.
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
