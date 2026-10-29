// Hak akses unduh file (Tech Spec §8, URD NF-04).
// File tersimpan sebagai key di Document, Certificate, dan AttendanceAppeal (surat sakit);
// dokumen kandidat juga di Document.
// Pemilik file = karyawan pemilik data tersebut.
import type { PrismaClient, Role } from "@/generated/prisma/client";
import { type FileExtension, MIME_TYPES } from "@/lib/storage/validate";

export type FileOwner = {
  /** null = tidak ada karyawan pemilik (mis. dokumen kandidat) → hanya Admin. */
  employeeId: string | null;
  /** User yang tercantum sebagai approver pengajuan terkait file ini (mis. verifikator sertifikat). */
  approverIds?: string[];
  fileName: string;
  mimeType: string;
};

export type FileAccessRepository = {
  findFileOwner(key: string): Promise<FileOwner | null>;
};

/**
 * Admin boleh semua file. Approver (role APPROVER) boleh file pengajuan yang mencantumkan dirinya
 * sebagai approver. Staf hanya file miliknya sendiri.
 */
export function canAccessFile(user: { id?: string; role: Role; employeeId: string | null }, owner: FileOwner): boolean {
  if (user.role === "ADMIN") return true;
  if (user.id && owner.approverIds?.includes(user.id)) return true;
  return owner.employeeId !== null && owner.employeeId === user.employeeId;
}

function mimeOf(key: string): string {
  return MIME_TYPES[key.split(".").pop() as FileExtension] ?? "application/octet-stream";
}

/** Cukup `prisma` atau `tx` dari `$transaction`. */
export type FileAccessDb = Pick<PrismaClient, "document" | "certificate" | "approvalRequest" | "attendanceAppeal">;

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
        select: { id: true, employeeId: true, name: true },
      });
      if (certificate) {
        const request = await db.approvalRequest.findUnique({
          where: { module_entityId: { module: "CERTIFICATE", entityId: certificate.id } },
          select: { steps: { select: { approverIds: true } } },
        });
        return {
          employeeId: certificate.employeeId,
          fileName: `${certificate.name}.${key.split(".").pop()}`,
          mimeType: mimeOf(key),
          approverIds: request?.steps.flatMap((s) => s.approverIds) ?? [],
        };
      }

      // Bukti surat sakit appeal absensi (2026-10-14): pemilik & approver appeal.
      const appeal = await db.attendanceAppeal.findFirst({ where: { fileKey: key }, select: { id: true, employeeId: true, fileName: true } });
      if (appeal) {
        const request = await db.approvalRequest.findUnique({
          where: { module_entityId: { module: "ATTENDANCE_APPEAL", entityId: appeal.id } },
          select: { steps: { select: { approverIds: true } } },
        });
        return { employeeId: appeal.employeeId, fileName: appeal.fileName ?? key, mimeType: mimeOf(key), approverIds: request?.steps.flatMap((s) => s.approverIds) ?? [] };
      }

      return null;
    },
  };
}
