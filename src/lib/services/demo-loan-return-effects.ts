// Efek approval verifikasi Pengecekan Unit (2026-11-20, modul DEMO_LOAN_RETURN, default Ko Yosep). Dipanggil approval
// engine di dalam transaksi keputusan (approval-effects.ts). Modul terpisah dari demo-loan.ts supaya tidak ada impor
// melingkar (service peminjaman memakai approval engine, engine memakai efek ini). Audit memuat unit supaya tercatat di
// Riwayat Unit ("Pengecekan diverifikasi" / "Verifikasi pengecekan ditolak").
import type { Prisma } from "@/generated/prisma/client";
import { isProblemCondition } from "@/lib/demo-loan";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

type Tx = Prisma.TransactionClient;

async function lockReviewedLoan(tx: Tx, loanId: string) {
  await tx.$queryRaw`SELECT id FROM "DemoLoan" WHERE id = ${loanId} FOR UPDATE`;
  const loan = await tx.demoLoan.findUniqueOrThrow({ where: { id: loanId }, include: { items: true } });
  if (loan.status !== "RETURN_REVIEW") throw new ServiceError("Peminjaman ini tidak sedang menunggu verifikasi pengecekan");
  return loan;
}

/**
 * Disetujui final: hasil pengecekan sesuai. Semua unit Baik → Selesai; ada Rusak / Tidak lengkap → Perlu Tindak Lanjut
 * (email tindak lanjut ke PIC & Operational dikirim setelah commit — approval-emails.ts; pengingat berikutnya 7 hari
 * dari sekarang).
 */
export async function applyVerifiedReturn(tx: Tx, loanId: string, approvedAt: Date, actorId: string | null) {
  const before = await lockReviewedLoan(tx, loanId);
  const followUp = before.items.some((item) => isProblemCondition(item.returnCondition));
  const after = await tx.demoLoan.update({
    where: { id: loanId },
    data: { status: followUp ? "FOLLOW_UP" : "RETURNED", followUpRemindedAt: followUp ? approvedAt : null },
    include: { items: true },
  });
  await logAudit(tx, { actorId, action: "UPDATE", entity: "DemoLoan", entityId: loanId, before, after });
}

/**
 * Ditolak (alasan wajib, di ApprovalRequestStep): hasil pengecekan tidak sesuai → kembali ke status Pengambilan supaya
 * Operational mengisi Pengecekan Unit ulang; setelah disimpan, approval dimulai lagi dari level 1.
 */
export async function rejectVerifiedReturn(tx: Tx, loanId: string, actorId: string | null) {
  const before = await lockReviewedLoan(tx, loanId);
  const after = await tx.demoLoan.update({ where: { id: loanId }, data: { status: "PICKUP" }, include: { items: true } });
  await logAudit(tx, { actorId, action: "UPDATE", entity: "DemoLoan", entityId: loanId, before, after });
}
