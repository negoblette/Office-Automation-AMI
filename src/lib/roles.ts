// Hak per role (Fase 14, 2026-10-02): ADMIN = kendali penuh; APPROVER = data sendiri + menyetujui
// pengajuan yang ditugaskan lewat Approval Flow; STAFF = data sendiri.
import type { Role } from "@/generated/prisma/enums";

/** Role yang boleh menjadi approver di Approval Flow & membuka halaman Approval. */
export const APPROVER_ROLES = ["ADMIN", "APPROVER"] as const satisfies readonly Role[];

export function canApprove(role: Role): boolean {
  return (APPROVER_ROLES as readonly Role[]).includes(role);
}

/**
 * Boleh memutuskan step approval yang sedang PENDING: approver yang ditugaskan di step itu, atau super admin
 * (2026-10-30) untuk pengajuan apa pun — kecuali pengajuannya sendiri.
 */
export function canActOnStep(actor: { id: string; isSuperAdmin: boolean }, step: { approverIds: string[] }, requesterId: string): boolean {
  return step.approverIds.includes(actor.id) || (actor.isSuperAdmin && actor.id !== requesterId);
}

/** Role yang wajib MFA (hardening Tahap 5: Admin & Approver; sejak 2026-10-30 semua role termasuk Staf). */
export const MFA_REQUIRED_ROLES = ["ADMIN", "APPROVER", "STAFF"] as const satisfies readonly Role[];

export function mfaRequired(role: Role): boolean {
  return (MFA_REQUIRED_ROLES as readonly Role[]).includes(role);
}
