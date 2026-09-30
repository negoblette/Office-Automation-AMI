import "server-only";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/services/audit";
import { type AuthRepository, verifyCredentials } from "@/lib/services/auth";
import { isLoginLocked, recordLoginFailure } from "@/lib/services/login-throttle";
import { loginSchema } from "@/lib/validators/auth";
import { authConfig } from "./config";

/** Kode error `inactive` dikirim ke halaman login untuk pesan "akun nonaktif". */
class InactiveAccountError extends CredentialsSignin {
  code = "inactive";
}

/** Kode `rate_limited`: terlalu banyak percobaan gagal (Tech Spec §9). */
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

const authRepository: AuthRepository = {
  findUserByEmail: (email) =>
    prisma.user.findUnique({
      where: { email },
      include: { employee: { select: { fullName: true } } },
    }),
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // Dicek sebelum password: saat terkunci, password benar pun ditolak.
        if (await isLoginLocked(prisma, parsed.data.email)) throw new RateLimitedError();

        const result = await verifyCredentials(authRepository, parsed.data.email, parsed.data.password);
        if (!result.ok) {
          if (result.reason === "INACTIVE") throw new InactiveAccountError();
          await recordLoginFailure(prisma, parsed.data.email, null);
          return null;
        }

        const userId = result.user.id;
        await prisma.$transaction(async (tx) => {
          await tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
          await logAudit(tx, { actorId: userId, action: "LOGIN", entity: "User", entityId: userId });
        });
        return result.user;
      },
    }),
  ],
});
