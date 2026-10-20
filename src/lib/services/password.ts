// Ganti password sendiri (hardening 2026-10; NIST SP 800-63B-4, OWASP Authentication Cheat Sheet).
import argon2 from "argon2";
import type { PrismaClient } from "@/generated/prisma/client";
import { passwordProblem } from "@/lib/password-policy";
import type { RequestMeta } from "@/lib/request-meta";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

/**
 * Password lama wajib benar. Setelah berhasil: hash baru, flag wajib-ganti dihapus, dan
 * `sessionVersion` naik sehingga semua sesi yang masih terbuka (termasuk perangkat lain) berakhir.
 */
export async function changeOwnPassword(
  db: PrismaClient,
  userId: string,
  input: { currentPassword: string; newPassword: string },
  meta?: RequestMeta,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, isActive: true, employee: { select: { fullName: true } } },
  });
  if (!user?.isActive) throw new ServiceError("Akun tidak ditemukan atau nonaktif");
  if (!(await argon2.verify(user.passwordHash, input.currentPassword))) {
    throw new ServiceError("Password saat ini salah", "currentPassword");
  }
  if (input.newPassword === input.currentPassword) {
    throw new ServiceError("Password baru harus berbeda dari password saat ini", "newPassword");
  }
  const problem = passwordProblem(input.newPassword, [user.email.split("@")[0], user.employee?.fullName ?? ""]);
  if (problem) throw new ServiceError(problem, "newPassword");

  const passwordHash = await argon2.hash(input.newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } },
    });
    await logAudit(tx, { actorId: userId, action: "UPDATE", entity: "User", entityId: userId, after: { passwordChanged: true }, ...meta });
  });
}
