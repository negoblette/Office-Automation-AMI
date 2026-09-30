// Efek saat pengajuan APPROVED final, per modul (Tech Spec §4.3). Dipanggil approval engine
// di dalam transaksi yang sama. Setiap fase modul menambahkan efeknya di sini secara eksplisit
// (bukan registrasi lewat side-effect import, supaya tidak ada efek yang terlewat).
import type { ApprovalModule, Prisma } from "@/generated/prisma/client";
import { applyApprovedHealthClaim } from "./health-payout";
import { applyApprovedLeave } from "./leave-balance";

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
};
