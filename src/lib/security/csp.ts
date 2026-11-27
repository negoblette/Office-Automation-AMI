// Content Security Policy (hardening Tahap 3; OWASP CSP Cheat Sheet & panduan Next.js
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md). Dipakai `proxy.ts`.

/**
 * Daftar sumber yang boleh dimuat browser untuk halaman aplikasi.
 * - script: hanya script bernonce dari Next.js; 'strict-dynamic' meneruskan izin ke file JavaScript
 *   yang dimuat script tersebut. Dev butuh 'unsafe-eval' untuk debugging React.
 * - style: 'unsafe-inline' karena banyak atribut `style={…}` (nonce tidak berlaku untuk atribut).
 * - sumber lain hanya dari domain sendiri; font `next/font` sudah disajikan dari server sendiri.
 * - `extraConnect`: alamat luar tambahan yang boleh dihubungi `fetch` browser — saat ini hanya path Google Calendar API
 *   untuk sinkronisasi libur mode browser (2026-11-27, `lib/holidays/mode.ts`). Berlaku di semua halaman karena
 *   perpindahan halaman Next.js tidak memuat ulang dokumen (CSP halaman pertama yang dibuka yang berlaku).
 */
export function buildCsp(nonce: string, isDev: boolean, extraConnect: readonly string[] = []): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    ["connect-src 'self'", ...extraConnect].join(" "),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Dev boleh lewat http://localhost atau IP jaringan; produksi selalu HTTPS.
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * `CSP_MODE=enforce` → browser memblokir pelanggaran; `CSP_MODE=report-only` → hanya peringatan di
 * console. Tanpa pengaturan: produksi enforce, dev report-only.
 */
export function cspHeaderName(
  mode = process.env.CSP_MODE ?? (process.env.NODE_ENV === "production" ? "enforce" : "report-only"),
): string {
  return mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
}
