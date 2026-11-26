import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig, isPublicPath } from "@/lib/auth/config";
import { buildCsp, cspHeaderName } from "@/lib/security/csp";

// Dijalankan sebelum setiap halaman:
// 1. Belum login → /login. Ini hanya lapisan pertama; otorisasi sebenarnya ada di requireUser/requireAdmin.
// 2. Pasang Content Security Policy dengan nonce baru per request (hardening Tahap 3).
const { auth } = NextAuth(authConfig);

// Diekspor sebagai default (bukan destructuring) agar dikenali analisis `next build`.
export default auth((request) => {
  // Karena memakai handler sendiri, Auth.js tidak lagi redirect otomatis → dilakukan di sini,
  // sama persis dengan bawaan Auth.js (parameter URL asal tetap dibawa, plus `callbackUrl`).
  if (!request.auth?.user && !isPublicPath(request.nextUrl.pathname)) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/login";
    signInUrl.searchParams.set("callbackUrl", request.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const headerName = cspHeaderName();
  const policy = buildCsp(nonce, process.env.NODE_ENV === "development");

  // Header di request dibaca Next.js untuk memasang nonce di script-nya; header di response untuk browser.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(headerName, policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(headerName, policy);
  return response;
});

export const config = {
  // Lewati API (termasuk /api/auth; /api/files mengecek akses sendiri), aset Next (`_next/static` = JS/CSS/gambar hasil
  // import, `_next/image` = optimasi gambar), dan favicon. Path berakhiran .png/.jpg/dst. TIDAK lagi dikecualikan (audit
  // keamanan 2026-11-26): halaman seperti /approval/x.png dulu tampil tanpa CSP. Folder public/ kosong — gambar baru
  // dipakai lewat `import` (masuk _next/static). Bila terpaksa menaruh file di public/ yang harus tampil sebelum login,
  // tambahkan namanya ke pengecualian di pola ini (seperti favicon.ico).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
