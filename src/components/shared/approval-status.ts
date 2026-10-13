// Label & warna status pengajuan/approval — satu sumber untuk semua modul (URD RMB-09).
import type { RequestStatus, Role, StepStatus } from "@/generated/prisma/enums";
import type { StatusVariant } from "./status-badge";

/**
 * Status pengajuan untuk pemohon: Draft / Menunggu L1 / Menunggu L2 / Disetujui.
 * `currentLevel` = level step yang sedang PENDING.
 */
export function requestStatusBadge(
  status: RequestStatus,
  currentLevel?: number | null,
): { label: string; variant: StatusVariant } {
  switch (status) {
    case "DRAFT":
      return { label: "Draft", variant: "neutral" };
    case "PENDING":
      return { label: currentLevel ? `Menunggu L${currentLevel}` : "Menunggu Persetujuan", variant: "pending" };
    case "APPROVED":
      return { label: "Disetujui", variant: "success" };
    case "REJECTED":
      return { label: "Ditolak", variant: "danger" };
  }
}

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  WAITING: "Menunggu giliran",
  PENDING: "Menunggu persetujuan",
  APPROVED: "Disetujui",
  SKIPPED: "Dilewati",
  REJECTED: "Ditolak",
};

/**
 * Peran approver sebuah level (2026-10-13): yang ditampilkan selama level belum diputuskan, menggantikan
 * nama orang — "Admin", "Approver", atau "Approver / Admin".
 */
export function approverRoleLabel(roles: (Role | null | undefined)[]): string {
  const set = new Set(roles.filter(Boolean));
  if (set.size === 1 && set.has("ADMIN")) return "Admin";
  if (set.size === 1 && set.has("APPROVER")) return "Approver";
  return "Approver / Admin";
}
