// Pemantauan & alarm keamanan (hardening Tahap 6; OWASP Logging & Monitoring, ASVS V7). Mendeteksi:
//  - login gagal beruntun ke akun Admin/Approver,
//  - perubahan role,
//  - akses data besar-besaran (unduh file / export / buka data pribadi) oleh satu user.
// Alarm dicatat di AuditLog (SECURITY_ALERT) — sekaligus mencegah email ganda dalam satu jendela waktu — lalu
// pemanggil mengirim email ke semua Admin aktif (mail/security-emails.ts#enqueueSecurityAlert) SETELAH commit.
import type { Prisma, Role } from "@/generated/prisma/client";
import { ROLE_LABEL } from "@/lib/labels";
import type { RequestMeta } from "@/lib/request-meta";
import { canApprove } from "@/lib/roles";
import { type AuditAction, logAudit } from "./audit";
import { LOGIN_WINDOW_MINUTES } from "./login-throttle";

type Db = Pick<Prisma.TransactionClient, "auditLog" | "user">;

/** Ambang alarm. */
export const ALERT_RULES = {
  /** Login gagal ke satu akun Admin/Approver dalam jendela rate limit login. */
  privilegedLoginFailures: 5,
  /** Unduhan file + export + buka data pribadi oleh satu user dalam 1 jam. */
  dataAccessPerHour: 50,
} as const;

export type SecurityAlertKind = "LOGIN_FAILURES" | "ROLE_CHANGED" | "MASS_ACCESS";

export type SecurityAlert = {
  kind: SecurityAlertKind;
  title: string;
  details: string[];
};

/** Aksi yang dihitung sebagai "akses data". */
const DATA_ACCESS_ACTIONS: AuditAction[] = ["DOWNLOAD", "EXPORT", "VIEW_PERSONAL_DATA"];

/**
 * Catat alarm bila belum ada alarm sejenis untuk `key` dalam `windowMinutes` terakhir (0 = selalu).
 * Mengembalikan alarm untuk dikirim, atau null bila sudah pernah dikirim.
 */
async function raiseAlert(db: Db, key: string, alert: SecurityAlert, windowMinutes: number, meta?: RequestMeta): Promise<SecurityAlert | null> {
  if (windowMinutes > 0) {
    const since = new Date(Date.now() - windowMinutes * 60_000);
    const existing = await db.auditLog.count({ where: { action: "SECURITY_ALERT", entity: alert.kind, entityId: key, createdAt: { gte: since } } });
    if (existing > 0) return null;
  }
  await logAudit(db, { actorId: null, action: "SECURITY_ALERT", entity: alert.kind, entityId: key, after: { title: alert.title, details: alert.details }, ...meta });
  return alert;
}

const where = (meta?: RequestMeta) => [`IP: ${meta?.ip ?? "tidak diketahui"}`, ...(meta?.userAgent ? [`Perangkat: ${meta.userAgent}`] : [])];

/**
 * Dipanggil setelah login gagal dicatat. Akun Admin/Approver dengan ≥ 5 gagal dalam 15 menit → alarm (sekali per
 * jendela). Email yang tidak terdaftar / akun Staf diabaikan.
 */
export async function checkPrivilegedLoginFailures(db: Db, email: string, meta?: RequestMeta): Promise<SecurityAlert | null> {
  const normalized = email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalized }, select: { role: true, isActive: true } });
  if (!user?.isActive || !canApprove(user.role)) return null;
  const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60_000);
  const failures = await db.auditLog.findMany({
    where: { action: "LOGIN_FAILED", entity: "Login", entityId: normalized, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: { ip: true },
  });
  if (failures.length < ALERT_RULES.privilegedLoginFailures) return null;
  const ips = [...new Set(failures.map((f) => f.ip ?? "tidak diketahui"))];
  return raiseAlert(
    db,
    normalized,
    {
      kind: "LOGIN_FAILURES",
      title: `Login gagal beruntun ke akun ${ROLE_LABEL[user.role]} ${normalized}`,
      details: [
        `${failures.length} percobaan gagal dalam ${LOGIN_WINDOW_MINUTES} menit terakhir.`,
        `Dari IP: ${ips.slice(0, 10).join(", ")}${ips.length > 10 ? ", …" : ""}`,
        "Bila bukan pemilik akun yang lupa password, periksa asal IP tersebut. IP yang gagal 5 kali ditahan otomatis 15 menit.",
      ],
    },
    LOGIN_WINDOW_MINUTES,
    meta,
  );
}

/** Perubahan role selalu dilaporkan ke semua Admin. */
export async function roleChangedAlert(
  db: Db,
  input: { userId: string; userName: string; from: Role; to: Role; actorName: string },
  meta?: RequestMeta,
): Promise<SecurityAlert | null> {
  return raiseAlert(
    db,
    input.userId,
    {
      kind: "ROLE_CHANGED",
      title: `Role ${input.userName} diubah: ${ROLE_LABEL[input.from]} → ${ROLE_LABEL[input.to]}`,
      details: [`Diubah oleh: ${input.actorName}`, ...where(meta)],
    },
    0,
    meta,
  );
}

/**
 * Catat satu akses data (unduh file / export) dengan IP & perangkat, lalu cek akses besar-besaran: ≥ 50 dalam 1 jam
 * oleh user yang sama → alarm (sekali per jam per user).
 */
export async function recordDataAccess(
  db: Db,
  input: { actorId: string; actorName: string; action: "DOWNLOAD" | "EXPORT"; entity: string; entityId: string; after?: unknown },
  meta?: RequestMeta,
): Promise<SecurityAlert | null> {
  await logAudit(db, { actorId: input.actorId, action: input.action, entity: input.entity, entityId: input.entityId, after: input.after, ...meta });
  const since = new Date(Date.now() - 60 * 60_000);
  const count = await db.auditLog.count({ where: { userId: input.actorId, action: { in: DATA_ACCESS_ACTIONS }, createdAt: { gte: since } } });
  if (count < ALERT_RULES.dataAccessPerHour) return null;
  return raiseAlert(
    db,
    input.actorId,
    {
      kind: "MASS_ACCESS",
      title: `Akses data besar-besaran oleh ${input.actorName}`,
      details: [`${count} unduhan file / export / buka data pribadi dalam 1 jam terakhir.`, ...where(meta), "Pastikan aktivitas ini memang sah."],
    },
    60,
    meta,
  );
}
