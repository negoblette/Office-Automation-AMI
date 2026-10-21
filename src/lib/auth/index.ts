import "server-only";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { requestMeta } from "@/lib/request-meta";
import { logAudit } from "@/lib/services/audit";
import { type AuthRepository, verifyCredentials } from "@/lib/services/auth";
import { enqueueSecurityAlert, enqueueSecurityNotice } from "@/lib/mail/security-emails";
import { isLoginLocked, recordLoginFailure } from "@/lib/services/login-throttle";
import { verifyLoginMfa } from "@/lib/services/mfa";
import { checkPrivilegedLoginFailures } from "@/lib/services/security-monitor";
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

/** Kode `mfa_required`: password benar, MFA aktif → form login meminta kode 6 digit (hardening Tahap 5). */
class MfaRequiredError extends CredentialsSignin {
  code = "mfa_required";
}

/** Kode `mfa_invalid`: kode authenticator / kode cadangan salah (dihitung sebagai login gagal). */
class MfaInvalidError extends CredentialsSignin {
  code = "mfa_invalid";
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
      credentials: { email: {}, password: {}, code: {} },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const meta = requestMeta(request.headers);

        // Dicek sebelum password: saat ditahan, password benar pun ditolak.
        if (await isLoginLocked(prisma, parsed.data.email, meta.ip)) throw new RateLimitedError();

        const result = await verifyCredentials(authRepository, parsed.data.email, parsed.data.password);
        if (!result.ok) {
          if (result.reason === "INACTIVE") throw new InactiveAccountError();
          await recordLoginFailure(prisma, parsed.data.email, null, meta);
          // Alarm ke Admin bila akun Admin/Approver gagal login beruntun (hardening Tahap 6).
          await enqueueSecurityAlert(prisma, await checkPrivilegedLoginFailures(prisma, parsed.data.email, meta));
          return null;
        }

        const userId = result.user.id;
        // Langkah kedua: MFA (hardening Tahap 5). Belum aktif → login lanjut; Admin/Approver lalu dipaksa
        // mendaftarkan authenticator di /mfa oleh requireUser.
        const mfa = await verifyLoginMfa(prisma, userId, parsed.data.code, meta);
        if (mfa.status === "REQUIRED") throw new MfaRequiredError();
        if (mfa.status === "INVALID") {
          await recordLoginFailure(prisma, parsed.data.email, userId, meta);
          await enqueueSecurityAlert(prisma, await checkPrivilegedLoginFailures(prisma, parsed.data.email, meta));
          throw new MfaInvalidError();
        }

        await prisma.$transaction(async (tx) => {
          await tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
          await logAudit(tx, { actorId: userId, action: "LOGIN", entity: "User", entityId: userId, ...meta });
        });
        if (mfa.status === "OK" && mfa.usedBackupCode) {
          await enqueueSecurityNotice(prisma, userId, { kind: "BACKUP_CODE_USED", remaining: mfa.backupRemaining }, meta);
        }
        return result.user;
      },
    }),
  ],
});
