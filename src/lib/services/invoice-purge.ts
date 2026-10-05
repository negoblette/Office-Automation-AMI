// Purge file invoice/kwitansi lama (Fase 14, keputusan user 2026-10-02): upload invoice sudah
// dihapus; file yang telanjur tersimpan hanya disimpan 2 tahun terakhir. Data nominal & pengajuan
// tetap ada — hanya file & referensinya yang dihapus. Pengecualian tertulis dari NFR v1.14
// "data tidak dihapus permanen". Dijalankan worker (`invoice.purge`, harian).
import type { PrismaClient } from "@/generated/prisma/client";
import { toJakartaIsoDate } from "@/lib/format";
import { logAudit } from "./audit";

export const INVOICE_RETENTION_YEARS = 2;

export type FileRemover = (key: string) => Promise<void>;

/** Batas tanggal: file dari pengajuan yang dibuat sebelum tanggal ini dihapus. */
export function purgeCutoff(todayIso: string): Date {
  const [y, m, d] = todayIso.split("-").map(Number);
  return new Date(Date.UTC(y - INVOICE_RETENTION_YEARS, m - 1, d) - 7 * 60 * 60 * 1000); // 00:00 WIB
}

export async function purgeOldInvoices(db: PrismaClient, removeFile: FileRemover, todayIso = toJakartaIsoDate()) {
  const cutoff = purgeCutoff(todayIso);
  const [receipts, invoices] = await Promise.all([
    db.reimbursementItem.findMany({
      where: { receiptFileKey: { not: null }, reimbursement: { createdAt: { lt: cutoff } } },
      select: { id: true, receiptFileKey: true },
    }),
    db.healthClaim.findMany({ where: { invoiceFileKey: { not: null }, createdAt: { lt: cutoff } }, select: { id: true, invoiceFileKey: true } }),
  ]);

  // File dihapus dulu (gagal hapus = file sudah tidak ada, tetap dilanjutkan), lalu referensinya.
  for (const key of [...receipts.map((r) => r.receiptFileKey!), ...invoices.map((i) => i.invoiceFileKey!)]) {
    await removeFile(key).catch(() => undefined);
  }
  await db.$transaction(async (tx) => {
    if (receipts.length) {
      await tx.reimbursementItem.updateMany({ where: { id: { in: receipts.map((r) => r.id) } }, data: { receiptFileKey: null, receiptFileName: null } });
    }
    if (invoices.length) {
      await tx.healthClaim.updateMany({ where: { id: { in: invoices.map((i) => i.id) } }, data: { invoiceFileKey: null, invoiceFileName: null } });
    }
    if (receipts.length || invoices.length) {
      await logAudit(tx, {
        actorId: null,
        action: "DELETE",
        entity: "InvoiceFile",
        entityId: `purge-${todayIso}`,
        before: { cutoff: cutoff.toISOString(), receiptItemIds: receipts.map((r) => r.id), healthClaimIds: invoices.map((i) => i.id) },
      });
    }
  });
  return { receipts: receipts.length, invoices: invoices.length };
}
