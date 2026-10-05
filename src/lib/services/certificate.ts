// Sertifikat & ijazah karyawan — URD CERT-01..02. Fase 14 (2026-10-05): setiap sertifikat baru
// diverifikasi lewat approval engine (modul CERTIFICATE, flow Ko Yosep → Bu Ika); yang
// meng-input = pemohon. Setelah terverifikasi hanya Admin yang boleh mengubah.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { fromIsoDate } from "@/lib/format";
import type { CertificateInput } from "@/lib/validators/certificate";
import { type Actor, assertFileKeyAvailable, getManageableEmployee } from "./access";
import { type ApprovalNotification, buildApproval } from "./approval";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { nextDocumentNumber } from "./numbering";

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

/** Tambah sertifikat + ajukan verifikasi. Kirim `notifications` (email approver) SETELAH commit. */
export async function addCertificate(db: PrismaClient, actor: Actor, employeeId: string, input: CertificateInput) {
  return db.$transaction(async (tx) => {
    await getManageableEmployee(tx, actor, employeeId);
    if (input.fileKey) await assertFileKeyAvailable(tx, input.fileKey);

    const number = await nextDocumentNumber(tx, "CRT");
    const created = await tx.certificate.create({ data: { employeeId, ...certificateData(input), verificationNumber: number } });
    const approval = await buildApproval(tx, { module: "CERTIFICATE", entityId: created.id, entityNumber: number, requesterId: actor.id });
    const certificate = await tx.certificate.findUniqueOrThrow({ where: { id: created.id } });
    await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "Certificate", entityId: certificate.id, after: certificate });
    return { ...certificate, notifications: approval.notifications as ApprovalNotification[] };
  });
}

/** Pengajuan verifikasi yang masih berjalan dibatalkan (sertifikat dihapus pemohon). */
async function cancelPendingVerification(tx: Prisma.TransactionClient, certificateId: string, actorId: string) {
  const request = await tx.approvalRequest.findUnique({ where: { module_entityId: { module: "CERTIFICATE", entityId: certificateId } } });
  if (request?.status !== "PENDING") return;
  await tx.approvalRequestStep.updateMany({
    where: { requestId: request.id, status: { in: ["PENDING", "WAITING"] } },
    data: { status: "REJECTED", note: "Dibatalkan: sertifikat dihapus", actedById: actorId, actedAt: new Date() },
  });
  await tx.approvalRequest.update({ where: { id: request.id }, data: { status: "REJECTED", currentLevel: null, completedAt: new Date() } });
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
    if (before.status === "APPROVED" && actor.role !== "ADMIN") {
      throw new ServiceError("Sertifikat sudah terverifikasi; perubahan hanya oleh Admin. Tambahkan sertifikat baru bila diperpanjang.");
    }
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
    await cancelPendingVerification(tx, certificateId, actor.id);
    await logAudit(tx, { actorId: actor.id, action: "DELETE", entity: "Certificate", entityId: certificateId, before: certificate });
  });
}
