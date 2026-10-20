// Keluarga & dokumen karyawan — URD DOC-01..03, Tech Spec §8.
// Yang boleh mengelola: Admin, atau karyawan pemilik data (hanya saat masih aktif).
import type { DocumentType, Prisma, PrismaClient } from "@/generated/prisma/client";
import { FAMILY_DOCUMENT_TYPE, hasFamilySection, PERSONAL_DOCUMENT_TYPES } from "@/lib/employee-documents";
import { fromIsoDate } from "@/lib/format";
import type { FamilyMemberInput } from "@/lib/validators/family";
import { type Actor, assertFileKeyAvailable, getManageableEmployee } from "./access";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { openFamilyMember, sealFamilyData } from "./personal-data";

export type { Actor } from "./access";

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------
// Anggota keluarga
// ---------------------------------------------------------------------

async function assertFamilyAllowed(tx: Tx, employeeId: string, input: FamilyMemberInput, maritalStatus: string, exceptId?: string) {
  if (maritalStatus === "SINGLE") {
    throw new ServiceError("Ubah status pernikahan di Data Diri terlebih dahulu", "relation");
  }
  if (input.relation === "SPOUSE") {
    if (maritalStatus !== "MARRIED") {
      throw new ServiceError("Data suami/istri hanya untuk status Menikah", "relation");
    }
    const spouse = await tx.familyMember.findFirst({
      where: { employeeId, relation: "SPOUSE", deletedAt: null, id: exceptId ? { not: exceptId } : undefined },
    });
    if (spouse) throw new ServiceError("Data suami/istri sudah ada", "relation");
  }
}

/** NIK & tanggal lahir (YYYY-MM-DD) dikunci (hardening Tahap 4). */
function familyData(input: FamilyMemberInput) {
  return {
    relation: input.relation,
    fullName: input.fullName,
    ...sealFamilyData({ nik: input.nik, birthDate: input.birthDate || null }),
  };
}

export async function addFamilyMember(db: PrismaClient, actor: Actor, employeeId: string, input: FamilyMemberInput) {
  return db.$transaction((tx) => addFamilyMemberInTx(tx, actor, employeeId, input));
}

export async function addFamilyMemberInTx(tx: Tx, actor: Actor, employeeId: string, input: FamilyMemberInput) {
  const employee = await getManageableEmployee(tx, actor, employeeId);
  await assertFamilyAllowed(tx, employeeId, input, employee.maritalStatus);

  const member = await tx.familyMember.create({ data: { employeeId, ...familyData(input) } });
  await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "FamilyMember", entityId: member.id, after: member });
  return openFamilyMember(member);
}

export async function updateFamilyMember(db: PrismaClient, actor: Actor, memberId: string, input: FamilyMemberInput) {
  return db.$transaction((tx) => updateFamilyMemberInTx(tx, actor, memberId, input));
}

export async function updateFamilyMemberInTx(tx: Tx, actor: Actor, memberId: string, input: FamilyMemberInput) {
  const before = await tx.familyMember.findUnique({ where: { id: memberId, deletedAt: null } });
  if (!before) throw new ServiceError("Data keluarga tidak ditemukan");
  const employee = await getManageableEmployee(tx, actor, before.employeeId);
  if (input.relation !== before.relation) {
    throw new ServiceError("Hubungan keluarga tidak bisa diubah; hapus lalu tambahkan ulang", "relation");
  }
  await assertFamilyAllowed(tx, before.employeeId, input, employee.maritalStatus, memberId);

  const after = await tx.familyMember.update({ where: { id: memberId }, data: familyData(input) });
  await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "FamilyMember", entityId: memberId, before, after });
  return openFamilyMember(after);
}

/** Hapus anggota keluarga beserta dokumennya (soft delete, NFR v1.14; file tetap disimpan). */
export async function deleteFamilyMember(db: PrismaClient, actor: Actor, memberId: string): Promise<void> {
  return db.$transaction((tx) => deleteFamilyMemberInTx(tx, actor, memberId));
}

export async function deleteFamilyMemberInTx(tx: Tx, actor: Actor, memberId: string): Promise<void> {
  const member = await tx.familyMember.findUnique({ where: { id: memberId }, include: { documents: { where: { deletedAt: null } } } });
  if (!member || member.deletedAt) throw new ServiceError("Data keluarga tidak ditemukan");
  await getManageableEmployee(tx, actor, member.employeeId);

  const deletedAt = new Date();
  await tx.document.updateMany({ where: { familyMemberId: memberId, deletedAt: null }, data: { deletedAt } });
  await tx.familyMember.update({ where: { id: memberId }, data: { deletedAt } });
  await logAudit(tx, { actorId: actor.id, action: "DELETE", entity: "FamilyMember", entityId: memberId, before: member });
}

// ---------------------------------------------------------------------
// Dokumen
// ---------------------------------------------------------------------

export type NewDocument = {
  employeeId: string;
  docType: DocumentType;
  familyMemberId?: string | null;
  fileKey: string;
  fileName: string;
  /** Diambil dari file asli di storage, bukan dari input client. */
  mimeType: string;
  sizeBytes: number;
  /** Masa berlaku (YYYY-MM-DD, opsional). */
  validUntil?: string | null;
};

const EMPLOYEE_DOCUMENT_TYPES = new Set<DocumentType>([...PERSONAL_DOCUMENT_TYPES, "SURAT_NIKAH_CERAI", "OTHER"]);

export async function addDocument(db: PrismaClient, actor: Actor, input: NewDocument) {
  return db.$transaction((tx) => addDocumentInTx(tx, actor, input));
}

export async function addDocumentInTx(tx: Tx, actor: Actor, input: NewDocument) {
  const employee = await getManageableEmployee(tx, actor, input.employeeId);

  await assertFileKeyAvailable(tx, input.fileKey, input.employeeId);

  if (input.familyMemberId) {
    const member = await tx.familyMember.findUnique({ where: { id: input.familyMemberId, deletedAt: null } });
    if (!member || member.employeeId !== input.employeeId) throw new ServiceError("Data keluarga tidak ditemukan");
    if (FAMILY_DOCUMENT_TYPE[member.relation] !== input.docType) {
      throw new ServiceError("Jenis dokumen tidak sesuai dengan anggota keluarga");
    }
  } else {
    if (!EMPLOYEE_DOCUMENT_TYPES.has(input.docType)) {
      throw new ServiceError("Dokumen ini harus ditautkan ke anggota keluarga");
    }
    if (input.docType === "SURAT_NIKAH_CERAI" && !hasFamilySection(employee.maritalStatus)) {
      throw new ServiceError("Surat nikah/cerai hanya untuk status selain Belum menikah");
    }
  }

  const document = await tx.document.create({
    data: {
      ownerType: input.familyMemberId ? "FAMILY" : "EMPLOYEE",
      employeeId: input.employeeId,
      familyMemberId: input.familyMemberId ?? null,
      docType: input.docType,
      fileKey: input.fileKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      validUntil: input.validUntil ? fromIsoDate(input.validUntil) : null,
      uploadedById: actor.id,
    },
  });
  await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "Document", entityId: document.id, after: document });
  return document;
}

/** Hapus dokumen (soft delete, NFR v1.14; file tetap disimpan). */
export async function deleteDocument(db: PrismaClient, actor: Actor, documentId: string): Promise<void> {
  return db.$transaction((tx) => deleteDocumentInTx(tx, actor, documentId));
}

export async function deleteDocumentInTx(tx: Tx, actor: Actor, documentId: string): Promise<void> {
  const document = await tx.document.findUnique({ where: { id: documentId } });
  if (!document?.employeeId || document.deletedAt) throw new ServiceError("Dokumen tidak ditemukan");
  await getManageableEmployee(tx, actor, document.employeeId);

  await tx.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
  await logAudit(tx, { actorId: actor.id, action: "DELETE", entity: "Document", entityId: documentId, before: document });
}
