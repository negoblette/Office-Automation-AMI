// Rate limit login (Tech Spec §9, hardening 2026-10). Percobaan gagal dicatat di AuditLog
// (action LOGIN_FAILED, entity "Login", entityId = email, kolom ip), jadi tetap berlaku lintas
// restart / lebih dari satu instance tanpa Redis. Tiga batas dalam 15 menit (OWASP Authentication
// Cheat Sheet, NIST SP 800-63B §5.2.2):
//  - email + IP sama         : tebak password biasa → hanya IP penyerang yang tertahan; pemilik akun
//                              dari tempat lain tetap bisa masuk (akun Admin tidak bisa dikunci orang lain);
//  - email dari banyak IP    : serangan terdistribusi ke satu akun;
//  - satu IP ke banyak email : password spraying.
// IP tidak diketahui (null) → batas pertama dihitung per email saja (perilaku lama).
// Buka blokir (hardening Tahap 6): audit log permanen, jadi catatan gagal tidak dihapus — Admin menulis LOGIN_UNLOCK dan
// percobaan gagal SEBELUM unlock itu tidak dihitung lagi untuk email tersebut (batas per IP tetap berlaku).
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
  const emailFailed = { ...failed, entityId: key(email), createdAt: { gte: await emailWindowStart(db, email, since) } };
  const [byEmail, byEmailAndIp, byIp] = await Promise.all([
    db.auditLog.count({ where: emailFailed }),
    ip ? db.auditLog.count({ where: { ...emailFailed, ip } }) : null,
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

/** Awal jendela hitung untuk satu email: 15 menit terakhir, atau sejak Admin membuka blokirnya (mana yang lebih baru). */
async function emailWindowStart(db: ThrottleDb, email: string, since: Date): Promise<Date> {
  const unlock = await db.auditLog.findFirst({
    where: { action: "LOGIN_UNLOCK", entity: "Login", entityId: key(email), createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return unlock && unlock.createdAt > since ? unlock.createdAt : since;
}

/**
 * Email yang loginnya sedang ditahan karena gagal berulang (dari IP mana pun) — untuk tanda "Login diblokir" & tombol
 * buka blokir di Setting → User. Batas per IP saja (password spraying) tidak ditampilkan di sini.
 */
export async function lockedLoginEmails(db: ThrottleDb, emails: string[], now = new Date()): Promise<Set<string>> {
  const since = new Date(now.getTime() - LOGIN_WINDOW_MINUTES * 60_000);
  const keys = emails.map(key);
  const [failures, unlocks] = await Promise.all([
    db.auditLog.findMany({
      where: { action: "LOGIN_FAILED", entity: "Login", entityId: { in: keys }, createdAt: { gte: since } },
      select: { entityId: true, ip: true, createdAt: true },
    }),
    db.auditLog.findMany({
      where: { action: "LOGIN_UNLOCK", entity: "Login", entityId: { in: keys }, createdAt: { gte: since } },
      select: { entityId: true, createdAt: true },
    }),
  ]);
  const lastUnlock = new Map<string, Date>();
  for (const u of unlocks) {
    const previous = lastUnlock.get(u.entityId);
    if (!previous || u.createdAt > previous) lastUnlock.set(u.entityId, u.createdAt);
  }

  const perEmail = new Map<string, number>();
  const perEmailIp = new Map<string, number>();
  for (const f of failures) {
    const unlockedAt = lastUnlock.get(f.entityId);
    if (unlockedAt && f.createdAt <= unlockedAt) continue;
    perEmail.set(f.entityId, (perEmail.get(f.entityId) ?? 0) + 1);
    const k = `${f.entityId}|${f.ip ?? ""}`;
    perEmailIp.set(k, (perEmailIp.get(k) ?? 0) + 1);
  }
  const locked = new Set<string>();
  for (const [email, count] of perEmail) if (count >= LOGIN_LIMITS.email) locked.add(email);
  for (const [k, count] of perEmailIp) if (count >= LOGIN_LIMITS.emailAndIp) locked.add(k.split("|")[0]);
  return locked;
}

/** Admin membuka blokir login suatu email (dicatat LOGIN_UNLOCK dengan IP Admin). */
export async function unlockLogin(db: ThrottleDb, actorId: string, email: string, meta?: RequestMeta): Promise<void> {
  await logAudit(db, { actorId, action: "LOGIN_UNLOCK", entity: "Login", entityId: key(email), ip: meta?.ip, userAgent: meta?.userAgent });
}
