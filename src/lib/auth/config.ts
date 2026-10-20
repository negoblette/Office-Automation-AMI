import type { NextAuthConfig } from "next-auth";

// Konfigurasi tanpa akses database/argon2, supaya bisa dipakai `proxy.ts` (Tahap 2.2).
// Provider Credentials ditambahkan di `./index.ts`.

/** Halaman yang boleh dibuka tanpa login. */
const PUBLIC_PATHS = ["/login"];

/** true untuk halaman yang boleh dibuka tanpa login (dipakai callback `authorized` & `proxy.ts`). */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

/**
 * Batas sesi (hardening 2026-10; OWASP ASVS V7, NIST SP 800-63B):
 * - idle: token diperpanjang setiap kali proxy memeriksa sesi (tiap buka halaman / kirim form),
 *   jadi `maxAge` berfungsi sebagai batas tidak aktif;
 * - absolut: sejak login, walau aktif terus.
 */
export const SESSION_IDLE_SECONDS = 60 * 60; // 1 jam
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000; // 12 jam

export const authConfig = {
  session: { strategy: "jwt", maxAge: SESSION_IDLE_SECONDS },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    // Dipakai `proxy.ts`: cek cepat dari token saja. Pengecekan sebenarnya (akun aktif,
    // role, versi sesi) tetap di requireUser/requireAdmin di server.
    authorized({ auth, request }) {
      return isPublicPath(request.nextUrl.pathname) || Boolean(auth?.user);
    },
    jwt({ token, user }) {
      // `user` hanya ada saat login; setelah itu data dibawa di token.
      if (user) {
        token.userId = user.id!;
        token.role = user.role;
        token.employeeId = user.employeeId;
        token.sessionVersion = user.sessionVersion;
        token.loginAt = Date.now();
      }
      // Lewat batas absolut (atau token lama tanpa `loginAt`) → sesi dibuang, wajib login ulang.
      if (typeof token.loginAt !== "number" || Date.now() - token.loginAt > SESSION_ABSOLUTE_MS) return null;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId;
      session.user.role = token.role;
      session.user.employeeId = token.employeeId;
      session.user.sessionVersion = token.sessionVersion;
      return session;
    },
  },
} satisfies NextAuthConfig;
