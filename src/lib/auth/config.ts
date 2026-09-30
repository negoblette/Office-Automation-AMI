import type { NextAuthConfig } from "next-auth";

// Konfigurasi tanpa akses database/argon2, supaya bisa dipakai `proxy.ts` (Tahap 2.2).
// Provider Credentials ditambahkan di `./index.ts`.

/** Halaman yang boleh dibuka tanpa login. */
const PUBLIC_PATHS = ["/login"];

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    // Dipakai `proxy.ts`: cek cepat dari token saja. Pengecekan sebenarnya (akun aktif,
    // role) tetap di requireUser/requireAdmin di server.
    authorized({ auth, request }) {
      const isPublic = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));
      return isPublic || Boolean(auth?.user);
    },
    jwt({ token, user }) {
      // `user` hanya ada saat login; setelah itu data dibawa di token.
      if (user) {
        token.userId = user.id!;
        token.role = user.role;
        token.employeeId = user.employeeId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId;
      session.user.role = token.role;
      session.user.employeeId = token.employeeId;
      return session;
    },
  },
} satisfies NextAuthConfig;
