// Label & link halaman per modul approval (email, halaman Approval).
import type { ApprovalModule } from "@/generated/prisma/enums";

export const APPROVAL_MODULE_META: Record<ApprovalModule, { label: string; path: (entityId: string) => string }> = {
  REIMBURSE: { label: "Reimburse", path: (id) => `/reimburse/${id}` },
  LEAVE: { label: "Cuti", path: () => "/cuti" },
  HEALTH: { label: "Klaim Kesehatan", path: (id) => `/kesehatan/${id}` },
  EXPENSE: { label: "Expense Project", path: () => "/project" },
  CERTIFICATE: { label: "Sertifikat", path: () => "/profil/sertifikat" },
  ATTENDANCE_APPEAL: { label: "Appeal Absensi", path: () => "/absensi" },
  OVERTIME: { label: "Overtime", path: () => "/overtime" },
  // Hanya untuk Approval Flow (pengajuannya tercatat sebagai Reimburse).
  OVERTIME_REIMBURSE: { label: "Reimburse Overtime", path: (id) => `/reimburse/${id}` },
  // Fase 16 (2026-11-17): peminjaman unit demo / Product Trial Form → Ko Yosep, lalu Operational.
  DEMO_LOAN: { label: "Peminjaman Unit", path: (id) => `/inventory/peminjaman/${id}` },
  // Tahap 16.4 (2026-11-18): perpanjangan jatuh tempo — entityId = id perpanjangan; halaman ini meneruskan ke peminjamannya.
  DEMO_LOAN_EXTENSION: { label: "Perpanjangan Peminjaman Unit", path: (id) => `/inventory/peminjaman/perpanjangan/${id}` },
  // 2026-11-20: verifikasi hasil Pengecekan Unit oleh engineer (Ko Yosep) — entityId = id peminjaman.
  DEMO_LOAN_RETURN: { label: "Verifikasi Pengembalian Unit", path: (id) => `/inventory/peminjaman/${id}` },
};

/**
 * Modul yang tidak punya Approval Flow sendiri (tidak bisa dipilih di Setting → Approval Flow): perpanjangan peminjaman
 * memakai flow "Peminjaman Unit" (DEMO_LOAN), jadi approvernya selalu sama dengan approver peminjaman.
 */
export const FLOWLESS_APPROVAL_MODULES: readonly ApprovalModule[] = ["DEMO_LOAN_EXTENSION"];

/** Approval Flow yang dipakai modul ini (sama dengan modulnya, kecuali modul tanpa flow sendiri). */
export const FLOW_MODULE_OF: Partial<Record<ApprovalModule, ApprovalModule>> = { DEMO_LOAN_EXTENSION: "DEMO_LOAN" };
