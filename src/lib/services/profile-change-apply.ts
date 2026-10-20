// Penerapan permintaan perubahan data karyawan yang sudah disetujui (2026-10-12) — dipanggil efek
// final approval modul PROFILE_CHANGE. Sengaja tidak meng-import approval engine (hindari import melingkar).
import type { Prisma } from "@/generated/prisma/client";
import type { EmployeeSelfInput } from "@/lib/validators/employee";
import type { FamilyMemberInput } from "@/lib/validators/family";
import type { Actor } from "./access";
import { deleteCertificateInTx } from "./certificate";
import { addDocumentInTx, addFamilyMemberInTx, deleteDocumentInTx, deleteFamilyMemberInTx, type NewDocument, updateFamilyMemberInTx } from "./document";
import { applySelfDataInTx } from "./employee";
import { ServiceError } from "./errors";
import { openJson } from "./personal-data";

type Tx = Prisma.TransactionClient;

/** Jalankan satu jenis perubahan atas nama `actor` (pemilik data). Dipakai saat validasi & saat disetujui. */
export async function runProfileChange(
  tx: Tx,
  actor: Actor,
  change: { kind: string; employeeId: string; targetId: string | null; payload: unknown },
): Promise<void> {
  switch (change.kind) {
    case "SELF_DATA":
      await applySelfDataInTx(tx, actor.id, change.employeeId, change.payload as EmployeeSelfInput);
      return;
    case "FAMILY_ADD":
      await addFamilyMemberInTx(tx, actor, change.employeeId, change.payload as FamilyMemberInput);
      return;
    case "FAMILY_UPDATE":
      await updateFamilyMemberInTx(tx, actor, change.targetId!, change.payload as FamilyMemberInput);
      return;
    case "FAMILY_DELETE":
      await deleteFamilyMemberInTx(tx, actor, change.targetId!);
      return;
    case "DOCUMENT_ADD":
      await addDocumentInTx(tx, actor, { ...(change.payload as Omit<NewDocument, "employeeId">), employeeId: change.employeeId });
      return;
    case "DOCUMENT_DELETE":
      await deleteDocumentInTx(tx, actor, change.targetId!);
      return;
    case "CERTIFICATE_DELETE":
      await deleteCertificateInTx(tx, actor, change.targetId!);
      return;
    default:
      throw new ServiceError("Jenis perubahan tidak dikenal");
  }
}

/** Efek final PROFILE_CHANGE: terapkan perubahan atas nama pemohon, tandai `appliedAt`. */
export async function applyApprovedProfileChange(tx: Tx, changeId: string, approvedAt: Date) {
  const change = await tx.profileChangeRequest.findUniqueOrThrow({ where: { id: changeId } });
  const requester = await tx.user.findUniqueOrThrow({ where: { id: change.requestedById }, select: { id: true, role: true, employeeId: true } });
  // Payload tersimpan terenkripsi (hardening Tahap 4).
  await runProfileChange(tx, requester, { ...change, payload: openJson(change.payload) });
  await tx.profileChangeRequest.update({ where: { id: changeId }, data: { status: "APPROVED", appliedAt: approvedAt } });
}
