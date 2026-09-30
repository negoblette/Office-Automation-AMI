// Label & warna status pengajuan/approval — satu sumber untuk semua modul (URD RMB-09).
import type { RequestStatus, StepStatus } from "@/generated/prisma/enums";
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
      return { label: currentLevel ? `Menunggu L${currentLevel}` : "Menunggu Persetujuan", variant: "info" };
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
