// Label & link halaman per modul approval (email, halaman Approval).
import type { ApprovalModule } from "@/generated/prisma/enums";

export const APPROVAL_MODULE_META: Record<ApprovalModule, { label: string; path: (entityId: string) => string }> = {
  REIMBURSE: { label: "Reimburse", path: (id) => `/reimburse/${id}` },
  LEAVE: { label: "Cuti", path: () => "/cuti" },
  HEALTH: { label: "Klaim Kesehatan", path: () => "/kesehatan" },
  EXPENSE: { label: "Expense Project", path: () => "/project" },
  REVENUE: { label: "Revenue Project", path: () => "/project" },
  CERTIFICATE: { label: "Sertifikat", path: () => "/profil/sertifikat" },
  ATTENDANCE_APPEAL: { label: "Appeal Absensi", path: () => "/absensi" },
};
