// Perpanjangan jatuh tempo peminjaman unit (Tahap 16.4, 2026-11-18; rekomendasi yang disepakati user):
//  - Diajukan pemohon peminjaman, atau Operational / Admin atas namanya, selama barang masih Dipinjam: tanggal selesai
//    baru + alasan. Paling banyak satu perpanjangan menunggu per peminjaman (baris DemoLoan dikunci FOR UPDATE).
//  - Disetujui lewat approval engine (modul DEMO_LOAN_EXTENSION, Approval Flow DEMO_LOAN = Ko Yosep). Efeknya di
//    demo-loan-extension-effects.ts: jatuh tempo pindah, pengingat mulai lagi dari tanggal baru.
//  - Dibatalkan pengaju sebelum diputuskan, atau ditutup otomatis saat barang diterima kembali.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { FLOW_MODULE_OF } from "@/lib/approval-modules";
import { extensionDueError } from "@/lib/demo-loan";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import type { DemoLoanExtensionInput } from "@/lib/validators/demo-loan";
import { type ApprovalNotification, buildApproval } from "./approval";
import { logAudit } from "./audit";
import type { LoanActor } from "./demo-loan";
import { ServiceError } from "./errors";
import { inventoryAccess } from "./inventory-access";

type Tx = Prisma.TransactionClient;

/**
 * Ajukan perpanjangan. Kirim `notifications` (email approval) setelah commit. Flow tanpa level / semua level terlewati
 * → langsung disetujui (efek final berjalan di transaksi ini).
 */
export async function requestLoanExtension(db: PrismaClient, actor: LoanActor, loanId: string, input: DemoLoanExtensionInput, today = toJakartaIsoDate()) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DemoLoan" WHERE id = ${loanId} FOR UPDATE`;
    const loan = await tx.demoLoan.findUnique({ where: { id: loanId }, select: { id: true, number: true, status: true, requesterId: true, startDate: true, dueDate: true } });
    if (!loan) throw new ServiceError("Peminjaman tidak ditemukan");
    const access = await inventoryAccess(tx, actor);
    if (!access.canView || (loan.requesterId !== actor.id && !access.canManage)) {
      throw new ServiceError("Hanya pemohon peminjaman, Operational, atau Admin yang bisa mengajukan perpanjangan");
    }
    if (loan.status !== "ON_LOAN") throw new ServiceError("Perpanjangan hanya untuk peminjaman yang barangnya sedang dipinjam");
    if (await tx.demoLoanExtension.count({ where: { loanId, status: "PENDING" } })) {
      throw new ServiceError("Masih ada perpanjangan yang menunggu approval untuk peminjaman ini");
    }
    const currentDueIso = toJakartaIsoDate(loan.dueDate);
    const error = extensionDueError({ startIso: toJakartaIsoDate(loan.startDate), currentDueIso, newDueIso: input.newDueDate, todayIso: today });
    if (error) throw new ServiceError(error, "newDueDate");

    const extension = await tx.demoLoanExtension.create({
      data: { loanId, requesterId: actor.id, previousDueDate: loan.dueDate, newDueDate: fromIsoDate(input.newDueDate), reason: input.reason },
    });
    await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "DemoLoanExtension", entityId: extension.id, after: extension });
    const approval = await buildApproval(tx, {
      module: "DEMO_LOAN_EXTENSION",
      entityId: extension.id,
      entityNumber: loan.number,
      requesterId: actor.id,
      flowModule: FLOW_MODULE_OF.DEMO_LOAN_EXTENSION,
    });
    return { extensionId: extension.id, status: approval.status, notifications: approval.notifications as ApprovalNotification[] };
  });
}

/** Tutup approval perpanjangan yang masih menunggu: level yang belum diputuskan → REJECTED dengan catatan (bukan penolakan). */
async function closeApproval(tx: Tx, extensionId: string, actorId: string, note: string, now: Date) {
  const request = await tx.approvalRequest.findUnique({ where: { module_entityId: { module: "DEMO_LOAN_EXTENSION", entityId: extensionId } } });
  if (request?.status !== "PENDING") return;
  await tx.approvalRequestStep.updateMany({
    where: { requestId: request.id, status: { in: ["PENDING", "WAITING"] } },
    data: { status: "REJECTED", note, actedById: actorId, actedAt: now },
  });
  await tx.approvalRequest.update({ where: { id: request.id }, data: { status: "REJECTED", currentLevel: null, completedAt: now } });
}

/** Batalkan perpanjangan yang belum diputuskan — hanya yang mengajukannya. */
export async function cancelLoanExtension(db: PrismaClient, actor: LoanActor, extensionId: string) {
  return db.$transaction(async (tx) => {
    const found = await tx.demoLoanExtension.findUnique({ where: { id: extensionId }, select: { loanId: true } });
    if (!found) throw new ServiceError("Perpanjangan tidak ditemukan");
    await tx.$queryRaw`SELECT id FROM "DemoLoan" WHERE id = ${found.loanId} FOR UPDATE`;
    const before = await tx.demoLoanExtension.findUniqueOrThrow({ where: { id: extensionId } });
    if (before.requesterId !== actor.id) throw new ServiceError("Hanya yang mengajukan yang bisa membatalkan perpanjangan ini");
    if (before.status !== "PENDING") throw new ServiceError("Perpanjangan ini sudah diputuskan atau dibatalkan");
    const now = new Date();
    await closeApproval(tx, extensionId, actor.id, "Dibatalkan pemohon", now);
    const after = await tx.demoLoanExtension.update({ where: { id: extensionId }, data: { status: "CANCELLED", decidedAt: now } });
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "DemoLoanExtension", entityId: extensionId, before, after });
    return after;
  });
}

/**
 * Barang diterima kembali (dipanggil di transaksi pengembalian, baris DemoLoan sudah dikunci): perpanjangan yang masih
 * menunggu tidak berlaku lagi → dibatalkan & keluar dari antrian approval.
 */
export async function closePendingExtensions(tx: Tx, loanId: string, actorId: string) {
  const pending = await tx.demoLoanExtension.findMany({ where: { loanId, status: "PENDING" } });
  const now = new Date();
  for (const before of pending) {
    await closeApproval(tx, before.id, actorId, "Barang sudah kembali", now);
    const after = await tx.demoLoanExtension.update({ where: { id: before.id }, data: { status: "CANCELLED", decidedAt: now } });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "DemoLoanExtension", entityId: before.id, before, after });
  }
}

/** Peminjaman milik perpanjangan (link email / lonceng / Approval → halaman detail peminjaman). */
export async function loanIdOfExtension(db: PrismaClient, extensionId: string): Promise<string | null> {
  const extension = await db.demoLoanExtension.findUnique({ where: { id: extensionId }, select: { loanId: true } });
  return extension?.loanId ?? null;
}
