// Audit log (URD NF-03, Tech Spec §9). Dipanggil dari Server Action / service,
// idealnya di dalam `prisma.$transaction` yang sama dengan perubahan datanya.
import type { Prisma } from "@/generated/prisma/client";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REVOKE" | "RESIGN" | "REHIRE" | "LOGIN" | "LOGIN_FAILED";

export type AuditEntry = {
  /** User pelaku; null untuk aksi sistem (mis. job worker). */
  actorId: string | null;
  action: AuditAction;
  /** Nama model Prisma, mis. "Employee", "Reimbursement". */
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
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
  const before = toAuditJson(entry.before);
  const after = toAuditJson(entry.after);

  await db.auditLog.create({
    data: {
      userId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      // Kolom Json? butuh undefined (bukan null JS) untuk dibiarkan kosong.
      before: before ?? undefined,
      after: after ?? undefined,
    },
  });
}
