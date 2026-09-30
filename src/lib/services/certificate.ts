// Sertifikat & ijazah karyawan — URD CERT-01..02.
import type { PrismaClient } from "@/generated/prisma/client";
import { fromIsoDate } from "@/lib/format";
import type { CertificateInput } from "@/lib/validators/certificate";
import { type Actor, assertFileKeyAvailable, getManageableEmployee } from "./access";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

function certificateData(input: CertificateInput) {
  return {
    type: input.type,
    name: input.name,
    issuer: input.issuer,
    number: input.number,
    startDate: fromIsoDate(input.startDate),
    endDate: input.endDate ? fromIsoDate(input.endDate) : null,
    fileKey: input.fileKey,
  };
}

export async function addCertificate(db: PrismaClient, actor: Actor, employeeId: string, input: CertificateInput) {
  return db.$transaction(async (tx) => {
    await getManageableEmployee(tx, actor, employeeId);
    if (input.fileKey) await assertFileKeyAvailable(tx, input.fileKey);

    const certificate = await tx.certificate.create({ data: { employeeId, ...certificateData(input) } });
    await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "Certificate", entityId: certificate.id, after: certificate });
    return certificate;
  });
}

/** Ubah sertifikat. Mengembalikan key file lama bila diganti/dihapus (untuk dihapus dari storage). */
export async function updateCertificate(
  db: PrismaClient,
  actor: Actor,
  certificateId: string,
  input: CertificateInput,
): Promise<string | null> {
  return db.$transaction(async (tx) => {
    const before = await tx.certificate.findUnique({ where: { id: certificateId, deletedAt: null } });
    if (!before) throw new ServiceError("Sertifikat tidak ditemukan");
    await getManageableEmployee(tx, actor, before.employeeId);
    const fileChanged = input.fileKey !== before.fileKey;
    if (input.fileKey && fileChanged) await assertFileKeyAvailable(tx, input.fileKey);

    const after = await tx.certificate.update({ where: { id: certificateId }, data: certificateData(input) });
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "Certificate", entityId: certificateId, before, after });
    return fileChanged ? before.fileKey : null;
  });
}

/** Hapus sertifikat (soft delete, NFR v1.14; file tetap disimpan). */
export async function deleteCertificate(db: PrismaClient, actor: Actor, certificateId: string): Promise<void> {
  return db.$transaction(async (tx) => {
    const certificate = await tx.certificate.findUnique({ where: { id: certificateId } });
    if (!certificate || certificate.deletedAt) throw new ServiceError("Sertifikat tidak ditemukan");
    await getManageableEmployee(tx, actor, certificate.employeeId);

    await tx.certificate.update({ where: { id: certificateId }, data: { deletedAt: new Date() } });
    await logAudit(tx, { actorId: actor.id, action: "DELETE", entity: "Certificate", entityId: certificateId, before: certificate });
  });
}
