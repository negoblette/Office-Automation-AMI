import type { NextConfig } from "next";

// Header keamanan dasar untuk semua response (Tahap 10.4, hardening Tahap 3).
// CSP dipasang terpisah di src/proxy.ts (butuh nonce per request); HSTS di reverse proxy nginx (hanya HTTPS).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Tab lain (mis. yang dibuka dari link) tidak bisa mengendalikan jendela aplikasi lewat window.opener.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Respons aplikasi (termasuk file /api/files) tidak boleh disematkan situs lain.
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Image produksi hanya berisi `.next/standalone` (Dockerfile, Tahap 10.5).
  output: "standalone",
  // Dev server boleh dibuka dari IP jaringan kantor (mis. http://10.192.113.5:3000), bukan hanya localhost.
  // Tanpa ini Next.js memblokir JavaScript dev → halaman tidak "hidup" & login gagal (2026-10-15).
  // Hanya berlaku saat `npm run dev`; tambahan host lewat env DEV_ALLOWED_ORIGINS (pisahkan dengan koma).
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*", ...(process.env.DEV_ALLOWED_ORIGINS?.split(",").map((h) => h.trim()).filter(Boolean) ?? [])],
  poweredByHeader: false,
  // Terminal `npm run dev` tidak mencetak argumen Server Action (password login/ganti password, NIK, data diri) —
  // hardening Tahap 4. Hanya berlaku saat dev; log request GET/POST tetap tampil.
  logging: { serverFunctions: false },
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
