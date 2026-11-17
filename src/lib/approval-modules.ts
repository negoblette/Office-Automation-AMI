// Label & link halaman per modul approval (email, halaman Approval).
import type { ApprovalModule } from "@/generated/prisma/enums";

export const APPROVAL_MODULE_META: Record<ApprovalModule, { label: string; path: (entityId: string) => string }> = {
  REIMBURSE: { label: "Reimburse", path: (id) => `/reimburse/${id}` },
  LEAVE: { label: "Cuti", path: () => "/cuti" },
  HEALTH: { label: "Klaim Kesehatan", path: () => "/kesehatan" },
  EXPENSE: { label: "Expense Project", path: () => "/project" },
  CERTIFICATE: { label: "Sertifikat", path: () => "/profil/sertifikat" },
  ATTENDANCE_APPEAL: { label: "Appeal Absensi", path: () => "/absensi" },
  OVERTIME: { label: "Overtime", path: () => "/overtime" },
  // Hanya untuk Approval Flow (pengajuannya tercatat sebagai Reimburse).
  OVERTIME_REIMBURSE: { label: "Reimburse Overtime", path: (id) => `/reimburse/${id}` },
  // Fase 16 (2026-11-17): peminjaman unit demo / Product Trial Form → Ko Yosep, lalu Operational.
  DEMO_LOAN: { label: "Peminjaman Unit", path: (id) => `/inventory/peminjaman/${id}` },
};
