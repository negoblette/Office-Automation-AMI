// Audit log (URD NF-03, Tech Spec §9). Dipanggil dari Server Action / service,
// idealnya di dalam `prisma.$transaction` yang sama dengan perubahan datanya.
import type { Prisma } from "@/generated/prisma/client";
import { protectAuditValue } from "./personal-data";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "APPROVE"
  | "REVOKE"
  | "REJECT"
  | "RESIGN"
  | "REHIRE"
  | "LOGIN"
  | "LOGIN_FAILED"
  /** Data pribadi asli dibuka lewat alat engineer `data:lihat` / `data:cari-nik` (hardening Tahap 4). */
  | "VIEW_PERSONAL_DATA"
  /** File upload diunduh / dibuka lewat /api/files (hardening Tahap 6). */
  | "DOWNLOAD"
  /** Export data (mis. Excel reimburse) — hardening Tahap 6. */
  | "EXPORT"
  /** Admin membuka blokir login suatu email (pengganti menghapus catatan LOGIN_FAILED; audit log permanen). */
  | "LOGIN_UNLOCK"
  /** Alarm keamanan yang sudah dikirim ke Admin (juga dipakai untuk mencegah email ganda). */
  | "SECURITY_ALERT"
  /** Pemegang kunci berhasil / gagal menguji kata sandi pemulihan (services/recovery-key.ts). */
  | "RECOVERY_KEY_TESTED"
  | "RECOVERY_KEY_TEST_FAILED";

export type AuditEntry = {
  /** User pelaku; null untuk aksi sistem (mis. job worker). */
  actorId: string | null;
  action: AuditAction;
  /** Nama model Prisma, mis. "Employee", "Reimbursement". */
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  /** IP & user agent pelaku (dari `requestMeta`), bila aksi berasal dari request. */
  ip?: string | null;
  userAgent?: string | null;
};

/** Cukup `prisma` atau `tx` dari `$transaction`. */
export type AuditDb = Pick<Prisma.TransactionClient, "auditLog">;

/** Field yang tidak pernah boleh masuk audit log. */
const SENSITIVE_KEYS = new Set(["passwordHash", "password"]);

/**
 * Ubah nilai menjadi JSON yang aman disimpan: BigInt → string (presisi utuh),
 * Date → ISO string, field sensitif dibuang, `undefined` dihilangkan.
 */
export function toAuditJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toAuditJson(item));
  if (typeof value === "object") {
    const result: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key) || item === undefined) continue;
      result[key] = toAuditJson(item);
    }
    return result;
  }
  return value as Prisma.InputJsonValue;
}

/** Catat satu entri audit log. */
export async function logAudit(db: AuditDb, entry: AuditEntry): Promise<void> {
  // Data pribadi yang masih terbuka dikunci dulu (hardening Tahap 4); baris dari database sudah terenkripsi.
  const before = toAuditJson(protectAuditValue(entry.entity, entry.before));
  const after = toAuditJson(protectAuditValue(entry.entity, entry.after));

  await db.auditLog.create({
    data: {
      userId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      // Kolom Json? butuh undefined (bukan null JS) untuk dibiarkan kosong; ip/userAgent ikut pola yang sama.
      before: before ?? undefined,
      after: after ?? undefined,
      ip: entry.ip ?? undefined,
      userAgent: entry.userAgent ?? undefined,
    },
  });
}
