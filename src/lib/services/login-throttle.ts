// Rate limit login sederhana (Tech Spec §9): maks 5 percobaan gagal per email dalam 15 menit.
// Percobaan gagal dicatat di AuditLog (action LOGIN_FAILED, entity "Login", entityId = email),
// jadi tetap berlaku lintas restart / lebih dari satu instance tanpa Redis.
import type { Prisma } from "@/generated/prisma/client";
import { logAudit } from "./audit";

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MINUTES = 15;

type ThrottleDb = Pick<Prisma.TransactionClient, "auditLog">;

const key = (email: string) => email.trim().toLowerCase();

/** true jika email ini sudah gagal login ≥ 5× dalam 15 menit terakhir. */
export async function isLoginLocked(db: ThrottleDb, email: string, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - LOGIN_WINDOW_MINUTES * 60_000);
  const failures = await db.auditLog.count({
    where: { entity: "Login", entityId: key(email), action: "LOGIN_FAILED", createdAt: { gte: since } },
  });
  return failures >= LOGIN_MAX_FAILURES;
}

/** Catat satu percobaan login gagal (password tidak pernah dicatat). */
export async function recordLoginFailure(db: ThrottleDb, email: string, userId: string | null): Promise<void> {
  await logAudit(db, { actorId: userId, action: "LOGIN_FAILED", entity: "Login", entityId: key(email) });
}
