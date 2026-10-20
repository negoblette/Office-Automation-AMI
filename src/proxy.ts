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
  // Lewati API (termasuk /api/auth; /api/files mengecek akses sendiri), aset Next, dan file statis.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
