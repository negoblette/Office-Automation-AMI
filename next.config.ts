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
  // Dev server boleh dibuka dari IP jaringan kantor (mis. http://10.192.113.5:3000), bukan hanya localhost.
  // Tanpa ini Next.js memblokir JavaScript dev → halaman tidak "hidup" & login gagal (2026-10-15).
  // Hanya berlaku saat `npm run dev`; tambahan host lewat env DEV_ALLOWED_ORIGINS (pisahkan dengan koma).
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*", ...(process.env.DEV_ALLOWED_ORIGINS?.split(",").map((h) => h.trim()).filter(Boolean) ?? [])],
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
