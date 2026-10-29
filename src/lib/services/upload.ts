// Upload & file (hardening Tahap 7; OWASP File Upload Cheat Sheet): kuota per orang, file hanya bisa ditautkan oleh
// pengunggahnya, dan pembersihan file yatim (ter-upload tapi tidak pernah dipakai data apa pun).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

/** Kuota upload per orang (keputusan user 2026-10-21). */
export const UPLOAD_QUOTA = { filesPerHour: 30, bytesPerDay: 200 * 1024 * 1024 } as const;
/** File yatim baru dihapus setelah umurnya ≥ 24 jam (memberi waktu form yang belum disimpan). */
export const ORPHAN_MIN_AGE_HOURS = 24;

type UploadDb = Pick<Prisma.TransactionClient, "uploadedFile">;

/** Pesan error bila upload berikutnya melewati kuota, atau null bila masih boleh. */
export async function uploadQuotaError(db: UploadDb, userId: string, sizeBytes: number, now = new Date()): Promise<string | null> {
  const hourAgo = new Date(now.getTime() - 60 * 60_000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  const [lastHour, lastDay] = await Promise.all([
    db.uploadedFile.count({ where: { uploaderId: userId, createdAt: { gte: hourAgo } } }),
    db.uploadedFile.aggregate({ where: { uploaderId: userId, createdAt: { gte: dayAgo } }, _sum: { sizeBytes: true } }),
  ]);
  if (lastHour >= UPLOAD_QUOTA.filesPerHour) {
    return `Batas upload ${UPLOAD_QUOTA.filesPerHour} file per jam tercapai. Coba lagi nanti.`;
  }
  if ((lastDay._sum.sizeBytes ?? 0) + sizeBytes > UPLOAD_QUOTA.bytesPerDay) {
    return `Batas upload ${UPLOAD_QUOTA.bytesPerDay / 1024 / 1024} MB per hari tercapai. Coba lagi besok.`;
  }
  return null;
}

/** Catat file yang baru di-upload beserta pengunggahnya. */
export async function registerUpload(db: UploadDb, userId: string, key: string, sizeBytes: number): Promise<void> {
  await db.uploadedFile.create({ data: { key, uploaderId: userId, sizeBytes } });
}

/**
 * Hanya pengunggah yang boleh menautkan file ke data (mencegah memakai key file orang lain yang bocor / ditebak).
 * Key tanpa catatan upload (bukan hasil upload lewat aplikasi) juga ditolak.
 */
export async function assertUploadedBy(db: UploadDb, fileKey: string, userId: string): Promise<void> {
  const upload = await db.uploadedFile.findUnique({ where: { key: fileKey }, select: { uploaderId: true } });
  if (!upload || upload.uploaderId !== userId) throw new ServiceError("File tidak valid atau bukan upload Anda, silakan upload ulang", "fileKey");
}

type OrphanDb = Pick<PrismaClient, "document" | "certificate" | "attendanceAppeal" | "auditLog">;

/**
 * Key yang dipakai data apa pun — TERMASUK data yang sudah di-soft-delete (file-nya sengaja disimpan, NFR v1.14).
 * Tambahkan di sini bila ada kolom file baru.
 */
async function referencedKeys(db: OrphanDb, keys: string[]): Promise<Set<string>> {
  const inKeys = { in: keys };
  const [documents, certificates, appeals] = await Promise.all([
    db.document.findMany({ where: { fileKey: inKeys }, select: { fileKey: true } }),
    db.certificate.findMany({ where: { fileKey: inKeys }, select: { fileKey: true } }),
    db.attendanceAppeal.findMany({ where: { fileKey: inKeys }, select: { fileKey: true } }),
  ]);
  return new Set(
    [
      ...documents.map((d) => d.fileKey),
      ...certificates.map((c) => c.fileKey),
      ...appeals.map((a) => a.fileKey),
    ].filter((key): key is string => Boolean(key)),
  );
}

export type StoredFileInfo = { key: string; modifiedAt: Date };

/**
 * Hapus file yatim: ada di storage, berumur ≥ 24 jam, dan tidak dipakai data apa pun. Tiap penghapusan tercatat di audit.
 * `dryRun` = hanya menghitung (untuk laporan / pengecekan).
 */
export async function purgeOrphanFiles(
  db: OrphanDb,
  storage: { list(): Promise<StoredFileInfo[]>; delete(key: string): Promise<void> },
  { now = new Date(), dryRun = false }: { now?: Date; dryRun?: boolean } = {},
): Promise<{ scanned: number; orphans: string[] }> {
  const cutoff = now.getTime() - ORPHAN_MIN_AGE_HOURS * 60 * 60_000;
  const files = await storage.list();
  const old = files.filter((file) => file.modifiedAt.getTime() <= cutoff).map((file) => file.key);
  const orphans: string[] = [];
  for (let i = 0; i < old.length; i += 500) {
    const batch = old.slice(i, i + 500);
    const used = await referencedKeys(db, batch);
    orphans.push(...batch.filter((key) => !used.has(key)));
  }
  if (!dryRun) {
    for (const key of orphans) {
      await storage.delete(key);
      await logAudit(db, { actorId: null, action: "DELETE", entity: "File", entityId: key, after: { reason: "File yatim (tidak dipakai data apa pun ≥ 24 jam)" } });
    }
  }
  return { scanned: files.length, orphans };
}
