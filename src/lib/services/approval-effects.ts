// Efek saat pengajuan APPROVED final, per modul (Tech Spec §4.3). Dipanggil approval engine
// di dalam transaksi yang sama. Setiap fase modul menambahkan efeknya di sini secara eksplisit
// (bukan registrasi lewat side-effect import, supaya tidak ada efek yang terlewat).
import type { ApprovalModule, Prisma } from "@/generated/prisma/client";
import { applyApprovedExtension, revertApprovedExtension } from "./demo-loan-extension-effects";
import { applyVerifiedReturn, rejectVerifiedReturn } from "./demo-loan-return-effects";
import { applyApprovedHealthClaim, revertApprovedHealthClaim } from "./health-payout";
import { ServiceError } from "./errors";
import { applyApprovedLeave, revertApprovedLeave } from "./leave-balance";

export type FinalEffectOptions = {
  /** HEALTH: nominal disetujui approver final (null = sama dengan nominal diajukan). */
  approvedAmount?: number | null;
  /** Approver final (atau pemohon bila disetujui otomatis) — pelaku audit perubahan entitas oleh efek. */
  actorId?: string;
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
  // Fase 9: expense project disetujui final → status APPROVED (masuk total project).
  EXPENSE: async (tx, entityId) => {
    await tx.projectExpense.update({ where: { id: entityId }, data: { status: "APPROVED" } });
  },
  // Fase 14: sertifikat terverifikasi (2026-10-12: Ci Ika).
  CERTIFICATE: async (tx, entityId) => {
    await tx.certificate.update({ where: { id: entityId }, data: { status: "APPROVED" } });
  },
  // Fase 14: appeal tidak hadir disetujui → hari itu berstatus Sakit / Kunjungan keluar (tidak dipotong cuti).
  ATTENDANCE_APPEAL: async (tx, entityId, approvedAt) => {
    await tx.attendanceAppeal.update({ where: { id: entityId }, data: { status: "APPROVED", approvedAt } });
  },
  // 2026-10-30: sesi overtime disetujui (Ko Yosep) → bisa dipilih di Reimburse Overtime.
  OVERTIME: async (tx, entityId, approvedAt) => {
    await tx.overtime.update({ where: { id: entityId }, data: { status: "APPROVED", approvedAt } });
  },
  // Fase 16 (2026-11-17): peminjaman unit disetujui (Ko Yosep) → masuk antrian Operational untuk disiapkan & dicetak.
  DEMO_LOAN: async (tx, entityId, approvedAt) => {
    await tx.demoLoan.update({ where: { id: entityId }, data: { status: "APPROVED", approvedAt } });
  },
  // Tahap 16.4 (2026-11-18): perpanjangan disetujui → jatuh tempo peminjaman pindah ke tanggal baru.
  DEMO_LOAN_EXTENSION: (tx, entityId, approvedAt, options) => applyApprovedExtension(tx, entityId, approvedAt, options.actorId ?? null),
  // 2026-11-20: hasil Pengecekan Unit diverifikasi engineer → Selesai, atau Perlu Tindak Lanjut bila ada unit bermasalah.
  // (Tanpa REVERT_EFFECTS: setelah final, unit sudah bisa dipinjam lagi / ditindaklanjuti — tidak bisa dibatalkan.)
  DEMO_LOAN_RETURN: (tx, entityId, approvedAt, options) => applyVerifiedReturn(tx, entityId, approvedAt, options.actorId ?? null),
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
  CERTIFICATE: async (tx, entityId) => {
    await tx.certificate.update({ where: { id: entityId }, data: { status: "PENDING" } });
  },
  ATTENDANCE_APPEAL: async (tx, entityId) => {
    await tx.attendanceAppeal.update({ where: { id: entityId }, data: { status: "PENDING", approvedAt: null } });
  },
  // Overtime yang sudah dipakai reimburse tidak bisa dibatalkan persetujuannya.
  OVERTIME: async (tx, entityId) => {
    const used = await tx.reimbursementItem.findFirst({ where: { overtimeId: entityId, reimbursement: { deletedAt: null } } });
    if (used) throw new ServiceError("Overtime ini sudah dipakai di reimburse — persetujuannya tidak bisa dibatalkan");
    await tx.overtime.update({ where: { id: entityId }, data: { status: "PENDING", approvedAt: null } });
  },
  // Barang yang sudah diantar tidak bisa "tidak jadi disetujui"; sebelum itu peminjaman kembali menunggu approval.
  DEMO_LOAN: async (tx, entityId) => {
    const loan = await tx.demoLoan.findUniqueOrThrow({ where: { id: entityId }, select: { status: true } });
    if (loan.status !== "APPROVED") throw new ServiceError("Barang sudah diantar — persetujuan peminjaman ini tidak bisa dibatalkan");
    await tx.demoLoan.update({ where: { id: entityId }, data: { status: "PENDING", approvedAt: null, itemSenderId: null } });
  },
  // Perpanjangan dibatalkan persetujuannya → jatuh tempo kembali ke tanggal lama (selama barang belum kembali).
  DEMO_LOAN_EXTENSION: revertApprovedExtension,
};

/** `options.actorId` = approver yang menolak (2026-11-20, untuk audit entitas); efek lama boleh mengabaikannya. */
export type RejectEffect = (tx: Prisma.TransactionClient, entityId: string, options: { actorId?: string }) => Promise<void>;

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
  CERTIFICATE: async (tx, entityId) => {
    await tx.certificate.update({ where: { id: entityId }, data: { status: "REJECTED" } });
  },
  ATTENDANCE_APPEAL: async (tx, entityId) => {
    await tx.attendanceAppeal.update({ where: { id: entityId }, data: { status: "REJECTED" } });
  },
  OVERTIME: async (tx, entityId) => {
    await tx.overtime.update({ where: { id: entityId }, data: { status: "REJECTED" } });
  },
  DEMO_LOAN: async (tx, entityId) => {
    await tx.demoLoan.update({ where: { id: entityId }, data: { status: "REJECTED" } });
  },
  // Perpanjangan ditolak: jatuh tempo tetap; pemohon bisa mengajukan perpanjangan baru.
  DEMO_LOAN_EXTENSION: async (tx, entityId) => {
    await tx.demoLoanExtension.updateMany({ where: { id: entityId, status: "PENDING" }, data: { status: "REJECTED", decidedAt: new Date() } });
  },
  // 2026-11-20: verifikasi pengecekan ditolak → Operational mengisi Pengecekan Unit ulang.
  DEMO_LOAN_RETURN: (tx, entityId, options) => rejectVerifiedReturn(tx, entityId, options.actorId ?? null),
};
