// Sertifikat & ijazah karyawan — URD CERT-01..02. Fase 14 (2026-10-05): setiap sertifikat baru
// diverifikasi lewat approval engine (modul CERTIFICATE, flow Ci Ika sejak 2026-10-12); yang
// meng-input = pemohon. Setelah terverifikasi hanya Admin yang boleh mengubah.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { fromIsoDate } from "@/lib/format";
import type { CertificateInput } from "@/lib/validators/certificate";
import { type Actor, assertFileKeyAvailable, getManageableEmployee } from "./access";
import { type ApprovalNotification, buildApproval, restartApproval } from "./approval";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { nextDocumentNumber } from "./numbering";

function certificateData(input: CertificateInput) {
  return {
    type: input.type,
    name: input.name,
    issuer: input.issuer,
    level: input.level,
    degree: input.degree,
    startDate: fromIsoDate(input.startDate),
    endDate: input.endDate ? fromIsoDate(input.endDate) : null,
    graduationDate: input.graduationDate ? fromIsoDate(input.graduationDate) : null,
    fileKey: input.fileKey,
  };
}

/**
 * Tambah sertifikat. Sertifikat PROFESIONAL diajukan verifikasi (approval); ijazah langsung tersimpan tanpa
 * approval (2026-10-16). Kirim `notifications` (email approver) SETELAH commit.
 */
export async function addCertificate(db: PrismaClient, actor: Actor, employeeId: string, input: CertificateInput) {
  return db.$transaction(async (tx) => {
    await getManageableEmployee(tx, actor, employeeId);
    if (input.fileKey) await assertFileKeyAvailable(tx, input.fileKey, actor.id);

    if (input.type !== "PROFESSIONAL") {
      const saved = await tx.certificate.create({ data: { employeeId, ...certificateData(input), status: "APPROVED" } });
      await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "Certificate", entityId: saved.id, after: saved });
      return { ...saved, notifications: [] as ApprovalNotification[] };
    }

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

/**
 * Ubah sertifikat. Sertifikat yang verifikasinya ditolak (2026-10-12, OI-05) → setelah direvisi otomatis
 * diajukan ulang (approval mulai lagi dari level 1). `notifications` di-enqueue pemanggil setelah commit.
 */
export async function updateCertificate(
  db: PrismaClient,
  actor: Actor,
  certificateId: string,
  input: CertificateInput,
): Promise<{ oldFileKey: string | null; notifications: ApprovalNotification[] }> {
  return db.$transaction(async (tx) => {
    const before = await tx.certificate.findUnique({ where: { id: certificateId, deletedAt: null } });
    if (!before) throw new ServiceError("Sertifikat tidak ditemukan");
    await getManageableEmployee(tx, actor, before.employeeId);
    if (before.type === "PROFESSIONAL" && before.status === "APPROVED" && actor.role !== "ADMIN") {
      throw new ServiceError("Sertifikat sudah terverifikasi; perubahan hanya oleh Admin. Tambahkan sertifikat baru bila diperpanjang.");
    }
    const fileChanged = input.fileKey !== before.fileKey;
    if (input.fileKey && fileChanged) await assertFileKeyAvailable(tx, input.fileKey, actor.id);

    const resubmit = before.status === "REJECTED";
    const after = await tx.certificate.update({
      where: { id: certificateId },
      data: { ...certificateData(input), ...(resubmit ? { status: "PENDING" as const } : {}) },
    });
    const notifications = resubmit
      ? (
          await restartApproval(tx, {
            module: "CERTIFICATE",
            entityId: certificateId,
            entityNumber: before.verificationNumber ?? (await nextDocumentNumber(tx, "CRT")),
            requesterId: actor.id,
          })
        ).notifications
      : [];
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "Certificate", entityId: certificateId, before, after });
    return { oldFileKey: fileChanged ? before.fileKey : null, notifications };
  });
}

/** Hapus sertifikat (soft delete, NFR v1.14; file tetap disimpan). */
export async function deleteCertificate(db: PrismaClient, actor: Actor, certificateId: string): Promise<void> {
  return db.$transaction((tx) => deleteCertificateInTx(tx, actor, certificateId));
}

export async function deleteCertificateInTx(tx: Prisma.TransactionClient, actor: Actor, certificateId: string): Promise<void> {
  const certificate = await tx.certificate.findUnique({ where: { id: certificateId } });
  if (!certificate || certificate.deletedAt) throw new ServiceError("Sertifikat tidak ditemukan");
  await getManageableEmployee(tx, actor, certificate.employeeId);

  await tx.certificate.update({ where: { id: certificateId }, data: { deletedAt: new Date() } });
  await cancelPendingVerification(tx, certificateId, actor.id);
  await logAudit(tx, { actorId: actor.id, action: "DELETE", entity: "Certificate", entityId: certificateId, before: certificate });
}
