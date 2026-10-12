// Efek saat pengajuan APPROVED final, per modul (Tech Spec §4.3). Dipanggil approval engine
// di dalam transaksi yang sama. Setiap fase modul menambahkan efeknya di sini secara eksplisit
// (bukan registrasi lewat side-effect import, supaya tidak ada efek yang terlewat).
import type { ApprovalModule, Prisma } from "@/generated/prisma/client";
import { applyApprovedHealthClaim, revertApprovedHealthClaim } from "./health-payout";
import { applyApprovedLeave, revertApprovedLeave } from "./leave-balance";
import { applyApprovedProfileChange } from "./profile-change-apply";

export type FinalEffectOptions = {
  /** HEALTH: nominal disetujui approver final (null = sama dengan nominal diajukan). */
  approvedAmount?: number | null;
};

export type FinalEffect = (tx: Prisma.TransactionClient, entityId: string, approvedAt: Date, options: FinalEffectOptions) => Promise<void>;

export const FINAL_EFFECTS: Partial<Record<ApprovalModule, FinalEffect>> = {
  // Fase 6: reimburse disetujui final → status APPROVED + approvedAt (Tech Spec §4.3).
  REIMBURSE: async (tx, entityId, approvedAt) => {
    await tx.reimbursement.update({ where: { id: entityId }, data: { status: "APPROVED", approvedAt } });
  },
  // Fase 7: cuti disetujui final → status APPROVED + saldo `used` bertambah.
  LEAVE: applyApprovedLeave,
  // Fase 8 / v1.14: klaim disetujui final → nominal disetujui + status APPROVED + HealthPayout.
  HEALTH: (tx, entityId, approvedAt, options) => applyApprovedHealthClaim(tx, entityId, approvedAt, options.approvedAmount ?? null),
  // Fase 9: expense/revenue project disetujui final → status APPROVED (masuk total project).
  EXPENSE: async (tx, entityId) => {
    await tx.projectExpense.update({ where: { id: entityId }, data: { status: "APPROVED" } });
  },
  REVENUE: async (tx, entityId) => {
    await tx.projectRevenue.update({ where: { id: entityId }, data: { status: "APPROVED" } });
  },
  // Fase 14: sertifikat terverifikasi (2026-10-12: Ci Ika).
  CERTIFICATE: async (tx, entityId) => {
    await tx.certificate.update({ where: { id: entityId }, data: { status: "APPROVED" } });
  },
  // Fase 14: appeal tidak hadir disetujui → hari itu berstatus Sakit / Kunjungan keluar (tidak dipotong cuti).
  ATTENDANCE_APPEAL: async (tx, entityId, approvedAt) => {
    await tx.attendanceAppeal.update({ where: { id: entityId }, data: { status: "APPROVED", approvedAt } });
  },
  // 2026-10-12: perubahan data karyawan disetujui Ci Ika → baru diterapkan. (Arrow: hindari akses binding
  // import melingkar saat modul dievaluasi.)
  PROFILE_CHANGE: (tx, entityId, approvedAt) => applyApprovedProfileChange(tx, entityId, approvedAt),
};

export type RevertEffect = (tx: Prisma.TransactionClient, entityId: string) => Promise<void>;

/**
 * Kebalikan FINAL_EFFECTS saat persetujuan final dibatalkan (2026-10-06: "ubah keputusan approval").
 * Entitas kembali PENDING; modul tanpa entri di sini tidak bisa dibatalkan setelah final.
 */
export const REVERT_EFFECTS: Partial<Record<ApprovalModule, RevertEffect>> = {
  REIMBURSE: async (tx, entityId) => {
    await tx.reimbursement.update({ where: { id: entityId }, data: { status: "PENDING", approvedAt: null } });
  },
  LEAVE: revertApprovedLeave,
  HEALTH: revertApprovedHealthClaim,
  EXPENSE: async (tx, entityId) => {
    await tx.projectExpense.update({ where: { id: entityId }, data: { status: "PENDING" } });
  },
  REVENUE: async (tx, entityId) => {
    await tx.projectRevenue.update({ where: { id: entityId }, data: { status: "PENDING" } });
  },
  CERTIFICATE: async (tx, entityId) => {
    await tx.certificate.update({ where: { id: entityId }, data: { status: "PENDING" } });
  },
  ATTENDANCE_APPEAL: async (tx, entityId) => {
    await tx.attendanceAppeal.update({ where: { id: entityId }, data: { status: "PENDING", approvedAt: null } });
  },
};

export type RejectEffect = (tx: Prisma.TransactionClient, entityId: string) => Promise<void>;

/**
 * Pengajuan ditolak approver (2026-10-12, OI-05): entitas berstatus REJECTED. Pemohon bisa merevisi lalu
 * mengajukan ulang (approval dimulai lagi dari level 1 lewat `restartApproval`).
 */
export const REJECT_EFFECTS: Partial<Record<ApprovalModule, RejectEffect>> = {
  REIMBURSE: async (tx, entityId) => {
    await tx.reimbursement.update({ where: { id: entityId }, data: { status: "REJECTED" } });
  },
  LEAVE: async (tx, entityId) => {
    await tx.leaveRequest.update({ where: { id: entityId }, data: { status: "REJECTED" } });
  },
  HEALTH: async (tx, entityId) => {
    await tx.healthClaim.update({ where: { id: entityId }, data: { status: "REJECTED" } });
  },
  EXPENSE: async (tx, entityId) => {
    await tx.projectExpense.update({ where: { id: entityId }, data: { status: "REJECTED" } });
  },
  REVENUE: async (tx, entityId) => {
    await tx.projectRevenue.update({ where: { id: entityId }, data: { status: "REJECTED" } });
  },
  CERTIFICATE: async (tx, entityId) => {
    await tx.certificate.update({ where: { id: entityId }, data: { status: "REJECTED" } });
  },
  ATTENDANCE_APPEAL: async (tx, entityId) => {
    await tx.attendanceAppeal.update({ where: { id: entityId }, data: { status: "REJECTED" } });
  },
  // Perubahan data ditolak → tidak diterapkan; karyawan bisa mengubah lagi (permintaan baru).
  PROFILE_CHANGE: async (tx, entityId) => {
    await tx.profileChangeRequest.update({ where: { id: entityId }, data: { status: "REJECTED" } });
  },
};
