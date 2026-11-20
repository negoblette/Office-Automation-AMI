// Efek approval perpanjangan jatuh tempo peminjaman unit (Tahap 16.4, 2026-11-18). Dipanggil approval engine di dalam
// transaksi keputusan (approval-effects.ts). Modul terpisah dari demo-loan-extension.ts supaya tidak ada impor melingkar
// (service perpanjangan memakai approval engine, engine memakai efek ini).
import type { Prisma } from "@/generated/prisma/client";
import { toJakartaIsoDate } from "@/lib/format";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

type Tx = Prisma.TransactionClient;

/** Kunci baris peminjaman (urutan kunci sama dengan aksi peminjaman lain) lalu muat beserta unitnya (untuk audit). */
async function lockLoanWithItems(tx: Tx, loanId: string) {
  await tx.$queryRaw`SELECT id FROM "DemoLoan" WHERE id = ${loanId} FOR UPDATE`;
  return tx.demoLoan.findUniqueOrThrow({ where: { id: loanId }, include: { items: true } });
}

/**
 * Disetujui final: jatuh tempo peminjaman = tanggal baru. Ditolak bila barang sudah kembali atau jatuh tempo sudah
 * berubah sejak diajukan (mis. perpanjangan lain) — approver diminta menolak saja. Audit memuat unit supaya tercatat di
 * Riwayat Unit ("Jatuh tempo diperpanjang").
 */
export async function applyApprovedExtension(tx: Tx, extensionId: string, approvedAt: Date, actorId: string | null) {
  const extension = await tx.demoLoanExtension.findUniqueOrThrow({ where: { id: extensionId } });
  const loan = await lockLoanWithItems(tx, extension.loanId);
  if (extension.status !== "PENDING") throw new ServiceError("Perpanjangan ini sudah tidak menunggu approval");
  if (loan.status !== "ON_LOAN") {
    throw new ServiceError("Barang sudah dijadwalkan diambil atau sudah kembali — perpanjangan ini tidak berlaku lagi. Tolak saja pengajuannya.");
  }
  if (toJakartaIsoDate(loan.dueDate) !== toJakartaIsoDate(extension.previousDueDate)) {
    throw new ServiceError("Jatuh tempo peminjaman sudah berubah sejak perpanjangan ini diajukan. Tolak saja pengajuannya.");
  }
  await tx.demoLoanExtension.update({ where: { id: extensionId }, data: { status: "APPROVED", decidedAt: approvedAt } });
  const after = await tx.demoLoan.update({ where: { id: loan.id }, data: { dueDate: extension.newDueDate }, include: { items: true } });
  await logAudit(tx, { actorId, action: "UPDATE", entity: "DemoLoan", entityId: loan.id, before: loan, after });
}

/**
 * Persetujuan final dibatalkan approver / Admin: jatuh tempo kembali ke tanggal lama dan perpanjangan menunggu lagi.
 * Hanya bila barang belum kembali dan jatuh tempo masih hasil perpanjangan ini.
 */
export async function revertApprovedExtension(tx: Tx, extensionId: string) {
  const extension = await tx.demoLoanExtension.findUniqueOrThrow({ where: { id: extensionId } });
  const loan = await lockLoanWithItems(tx, extension.loanId);
  if (loan.status !== "ON_LOAN") {
    throw new ServiceError("Barang sudah dijadwalkan diambil atau sudah kembali — persetujuan perpanjangan ini tidak bisa dibatalkan");
  }
  if (extension.status !== "APPROVED" || toJakartaIsoDate(loan.dueDate) !== toJakartaIsoDate(extension.newDueDate)) {
    throw new ServiceError("Jatuh tempo sudah berubah lagi — persetujuan perpanjangan ini tidak bisa dibatalkan");
  }
  if (await tx.demoLoanExtension.count({ where: { loanId: loan.id, status: "PENDING", id: { not: extensionId } } })) {
    throw new ServiceError("Masih ada perpanjangan lain yang menunggu approval — putuskan itu dulu");
  }
  await tx.demoLoanExtension.update({ where: { id: extensionId }, data: { status: "PENDING", decidedAt: null } });
  const after = await tx.demoLoan.update({ where: { id: loan.id }, data: { dueDate: extension.previousDueDate }, include: { items: true } });
  await logAudit(tx, { actorId: null, action: "UPDATE", entity: "DemoLoan", entityId: loan.id, before: loan, after });
}
