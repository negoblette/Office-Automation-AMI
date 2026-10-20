// Rate limit login (Tech Spec §9, hardening 2026-10). Percobaan gagal dicatat di AuditLog
// (action LOGIN_FAILED, entity "Login", entityId = email, kolom ip), jadi tetap berlaku lintas
// restart / lebih dari satu instance tanpa Redis. Tiga batas dalam 15 menit (OWASP Authentication
// Cheat Sheet, NIST SP 800-63B §5.2.2):
//  - email + IP sama         : tebak password biasa → hanya IP penyerang yang tertahan; pemilik akun
//                              dari tempat lain tetap bisa masuk (akun Admin tidak bisa dikunci orang lain);
//  - email dari banyak IP    : serangan terdistribusi ke satu akun;
//  - satu IP ke banyak email : password spraying.
// IP tidak diketahui (null) → batas pertama dihitung per email saja (perilaku lama).
import type { Prisma } from "@/generated/prisma/client";
import type { RequestMeta } from "@/lib/request-meta";
import { logAudit } from "./audit";

export const LOGIN_WINDOW_MINUTES = 15;
export const LOGIN_LIMITS = { emailAndIp: 5, email: 20, ip: 20 } as const;

type ThrottleDb = Pick<Prisma.TransactionClient, "auditLog">;

const key = (email: string) => email.trim().toLowerCase();

/** true jika login untuk email ini (dari IP ini) sedang ditahan. */
export async function isLoginLocked(db: ThrottleDb, email: string, ip: string | null = null, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - LOGIN_WINDOW_MINUTES * 60_000);
  const failed = { action: "LOGIN_FAILED", entity: "Login", createdAt: { gte: since } };
  const [byEmail, byEmailAndIp, byIp] = await Promise.all([
    db.auditLog.count({ where: { ...failed, entityId: key(email) } }),
    ip ? db.auditLog.count({ where: { ...failed, entityId: key(email), ip } }) : null,
    ip ? db.auditLog.count({ where: { ...failed, ip } }) : null,
  ]);
  return (byEmailAndIp ?? byEmail) >= LOGIN_LIMITS.emailAndIp || byEmail >= LOGIN_LIMITS.email || (byIp ?? 0) >= LOGIN_LIMITS.ip;
}

/** Catat satu percobaan login gagal beserta IP & user agent (password tidak pernah dicatat). */
export async function recordLoginFailure(db: ThrottleDb, email: string, userId: string | null, meta?: RequestMeta): Promise<void> {
  await logAudit(db, {
    actorId: userId,
    action: "LOGIN_FAILED",
    entity: "Login",
    entityId: key(email),
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });
}
