// Hak akses unduh file (Tech Spec §8, URD NF-04).
// File tersimpan sebagai key di 4 tempat: Document, Certificate, ReimbursementItem (kwitansi),
// HealthClaim (invoice). Pemilik file = karyawan pemilik data tersebut.
import type { PrismaClient, Role } from "@/generated/prisma/client";
import { type FileExtension, MIME_TYPES } from "@/lib/storage/validate";

export type FileOwner = {
  /** null = tidak ada karyawan pemilik (mis. dokumen kandidat) → hanya Admin. */
  employeeId: string | null;
  fileName: string;
  mimeType: string;
};

export type FileAccessRepository = {
  findFileOwner(key: string): Promise<FileOwner | null>;
};

/**
 * Admin boleh semua file. Approver pengajuan selalu Admin (Tech Spec §4.2), jadi ikut
 * tercakup aturan ini. Staf hanya file miliknya sendiri.
 */
export function canAccessFile(user: { role: Role; employeeId: string | null }, owner: FileOwner): boolean {
  if (user.role === "ADMIN") return true;
  return owner.employeeId !== null && owner.employeeId === user.employeeId;
}

function mimeOf(key: string): string {
  return MIME_TYPES[key.split(".").pop() as FileExtension] ?? "application/octet-stream";
}

/** Cukup `prisma` atau `tx` dari `$transaction`. */
export type FileAccessDb = Pick<PrismaClient, "document" | "certificate" | "reimbursementItem" | "healthClaim">;

export function prismaFileAccessRepository(db: FileAccessDb): FileAccessRepository {
  return {
    async findFileOwner(key) {
      const document = await db.document.findFirst({
        where: { fileKey: key, deletedAt: null },
        select: { employeeId: true, fileName: true, mimeType: true, familyMember: { select: { employeeId: true } } },
      });
      if (document) {
        return {
          employeeId: document.employeeId ?? document.familyMember?.employeeId ?? null,
          fileName: document.fileName,
          mimeType: document.mimeType,
        };
      }

      const certificate = await db.certificate.findFirst({
        where: { fileKey: key, deletedAt: null },
        select: { employeeId: true, name: true },
      });
      if (certificate) {
        return { employeeId: certificate.employeeId, fileName: `${certificate.name}.${key.split(".").pop()}`, mimeType: mimeOf(key) };
      }

      const receipt = await db.reimbursementItem.findFirst({
        where: { receiptFileKey: key, reimbursement: { deletedAt: null } },
        select: { receiptFileName: true, reimbursement: { select: { employeeId: true } } },
      });
      if (receipt) {
        return {
          employeeId: receipt.reimbursement.employeeId,
          fileName: receipt.receiptFileName ?? key,
          mimeType: mimeOf(key),
        };
      }

      const invoice = await db.healthClaim.findFirst({
        where: { invoiceFileKey: key },
        select: { employeeId: true, invoiceFileName: true },
      });
      if (invoice) {
        return { employeeId: invoice.employeeId, fileName: invoice.invoiceFileName, mimeType: mimeOf(key) };
      }

      return null;
    },
  };
}
