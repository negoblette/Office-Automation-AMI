// Kandidat karyawan — URD CAN-01..03, Tech Spec §6.1 (konversi kandidat). Dikelola Admin.
import argon2 from "argon2";
import type { DocumentType, PrismaClient } from "@/generated/prisma/client";
import { PERSONAL_DOCUMENT_TYPES } from "@/lib/employee-documents";
import type { CandidateInput, ConvertCandidateInput } from "@/lib/validators/candidate";
import { assertFileKeyAvailable } from "./access";
import { logAudit } from "./audit";
import { createEmployeeInTx } from "./employee";
import { ServiceError } from "./errors";

export async function saveCandidate(db: PrismaClient, actorId: string, candidateId: string | null, input: CandidateInput) {
  return db.$transaction(async (tx) => {
    const before = candidateId ? await tx.candidate.findUnique({ where: { id: candidateId, deletedAt: null } }) : null;
    if (candidateId && !before) throw new ServiceError("Kandidat tidak ditemukan");
    if (before?.convertedEmployeeId) throw new ServiceError("Kandidat yang sudah menjadi karyawan tidak bisa diubah");
    const after = before
      ? await tx.candidate.update({ where: { id: before.id }, data: input })
      : await tx.candidate.create({ data: input });
    await logAudit(tx, { actorId, action: before ? "UPDATE" : "CREATE", entity: "Candidate", entityId: after.id, before, after });
    return after;
  });
}

/** Hapus kandidat beserta dokumennya (soft delete, NFR v1.14; file tetap disimpan). */
export async function deleteCandidate(db: PrismaClient, actorId: string, candidateId: string): Promise<void> {
  return db.$transaction(async (tx) => {
    const candidate = await tx.candidate.findUnique({ where: { id: candidateId }, include: { documents: { where: { deletedAt: null } } } });
    if (!candidate || candidate.deletedAt) throw new ServiceError("Kandidat tidak ditemukan");
    if (candidate.convertedEmployeeId) throw new ServiceError("Kandidat yang sudah menjadi karyawan tidak bisa dihapus");
    const deletedAt = new Date();
    await tx.document.updateMany({ where: { candidateId, deletedAt: null }, data: { deletedAt } });
    await tx.candidate.update({ where: { id: candidateId }, data: { deletedAt } });
    await logAudit(tx, { actorId, action: "DELETE", entity: "Candidate", entityId: candidateId, before: candidate });
  });
}

export type NewCandidateDocument = {
  candidateId: string;
  docType: DocumentType;
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

const CANDIDATE_DOCUMENT_TYPES = new Set<DocumentType>([...PERSONAL_DOCUMENT_TYPES, "OTHER"]);

/** Dokumen kandidat: jenis sama dengan dokumen pribadi karyawan (CAN-01). */
export async function addCandidateDocument(db: PrismaClient, actorId: string, input: NewCandidateDocument) {
  return db.$transaction(async (tx) => {
    const candidate = await tx.candidate.findUnique({ where: { id: input.candidateId } });
    if (!candidate || candidate.deletedAt) throw new ServiceError("Kandidat tidak ditemukan");
    if (candidate.convertedEmployeeId) throw new ServiceError("Kandidat sudah menjadi karyawan; kelola dokumen di data karyawan");
    if (!CANDIDATE_DOCUMENT_TYPES.has(input.docType)) throw new ServiceError("Jenis dokumen tidak berlaku untuk kandidat");
    await assertFileKeyAvailable(tx, input.fileKey);

    const document = await tx.document.create({
      data: { ownerType: "CANDIDATE", ...input, uploadedById: actorId },
    });
    await logAudit(tx, { actorId, action: "CREATE", entity: "Document", entityId: document.id, after: document });
    return document;
  });
}

export async function deleteCandidateDocument(db: PrismaClient, actorId: string, documentId: string): Promise<void> {
  return db.$transaction(async (tx) => {
    const document = await tx.document.findUnique({ where: { id: documentId } });
    if (!document?.candidateId || document.deletedAt) throw new ServiceError("Dokumen tidak ditemukan");
    await tx.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
    await logAudit(tx, { actorId, action: "DELETE", entity: "Document", entityId: documentId, before: document });
  });
}

/**
 * Konversi kandidat Diterima → karyawan tanpa input ulang (CAN-03): buat Employee + periode +
 * User dari data kandidat, salin NIK & HP, pindahkan dokumen (ownerType → EMPLOYEE).
 */
export async function convertCandidate(db: PrismaClient, actorId: string, candidateId: string, input: ConvertCandidateInput) {
  const passwordHash = await argon2.hash(input.password);
  return db.$transaction(async (tx) => {
    const candidate = await tx.candidate.findUnique({ where: { id: candidateId, deletedAt: null } });
    if (!candidate) throw new ServiceError("Kandidat tidak ditemukan");
    if (candidate.convertedEmployeeId) throw new ServiceError("Kandidat ini sudah menjadi karyawan");
    if (candidate.status !== "ACCEPTED") throw new ServiceError("Hanya kandidat berstatus Diterima yang bisa dijadikan karyawan");

    if (candidate.nik) {
      const owner = await tx.employee.findUnique({ where: { nik: candidate.nik }, select: { fullName: true, status: true } });
      if (owner) {
        throw new ServiceError(
          owner.status === "RESIGNED"
            ? `NIK sudah terdaftar atas ${owner.fullName} (resign). Gunakan "Aktifkan kembali" di Arsip Karyawan.`
            : `NIK sudah terdaftar atas karyawan aktif ${owner.fullName}`,
        );
      }
    }

    const { employeeId } = await createEmployeeInTx(tx, actorId, { ...input, fullName: candidate.fullName, email: candidate.email }, passwordHash);
    await tx.employee.update({ where: { id: employeeId }, data: { nik: candidate.nik, phone: candidate.phone } });
    const moved = await tx.document.updateMany({
      where: { candidateId, deletedAt: null },
      data: { ownerType: "EMPLOYEE", employeeId, candidateId: null },
    });
    await tx.candidate.update({ where: { id: candidateId }, data: { convertedEmployeeId: employeeId } });

    await logAudit(tx, {
      actorId,
      action: "UPDATE",
      entity: "Candidate",
      entityId: candidateId,
      before: { convertedEmployeeId: null },
      after: { convertedEmployeeId: employeeId, movedDocuments: moved.count },
    });
    return { employeeId, movedDocuments: moved.count };
  });
}
