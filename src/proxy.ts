import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

// Belum login → redirect ke /login (callback `authorized` di authConfig).
// Ini hanya lapisan pertama; otorisasi sebenarnya ada di requireUser/requireAdmin.
// Diekspor sebagai default (bukan destructuring) agar dikenali analisis `next build`.
const { auth } = NextAuth(authConfig);
export default auth;

export const config = {
  // Lewati API (termasuk /api/auth; /api/files mengecek akses sendiri), aset Next, dan file statis.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
