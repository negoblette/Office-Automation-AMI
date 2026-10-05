// Hak per role (Fase 14, 2026-10-02): ADMIN = kendali penuh; APPROVER = data sendiri + menyetujui
// pengajuan yang ditugaskan lewat Approval Flow; STAFF = data sendiri.
import type { Role } from "@/generated/prisma/enums";

/** Role yang boleh menjadi approver di Approval Flow & membuka halaman Approval. */
export const APPROVER_ROLES = ["ADMIN", "APPROVER"] as const satisfies readonly Role[];

export function canApprove(role: Role): boolean {
  return (APPROVER_ROLES as readonly Role[]).includes(role);
}
