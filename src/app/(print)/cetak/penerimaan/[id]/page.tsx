import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SheetLabel } from "@/components/print/form-copy";
import { HafSheet, type HafSheetData } from "@/components/print/haf-sheet";
import { PrintToolbar } from "@/components/print/print-button";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { formatEnglishDate, groupLoanItems } from "@/lib/demo-loan";
import { ASSET_OWNERSHIP_LABEL } from "@/lib/inventory";
import { getGoodsReceipt } from "@/lib/services/goods-receipt-queries";

export const metadata: Metadata = { title: "Hardware Admission Form" };

/**
 * Hardware Admission Form penerimaan barang principal / distributor (2026-11-20): From = principal / distributor + up:
 * kontak, Date = tanggal terima, PIC, Prepared By = Operational yang mencatat, unit per part number (Qty & S/N), Remarks
 * (asal & keperluan), Returned By = pengirim, Received By = karyawan AMI penerima. Sekali cetak = 2 lembar A4 (asli +
 * copy). Semua user Inventaris boleh membuka.
 */
export default async function ReceiptHafPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInventory("view");
  const { id } = await params;
  const receipt = await getGoodsReceipt(prisma, id);
  if (!receipt) notFound();

  const date = formatEnglishDate(receipt.receivedDate);
  const data: HafSheetData = {
    number: receipt.hafNumber,
    from: receipt.ownerName,
    contact: receipt.contactName,
    date,
    pic: receipt.picName,
    preparedBy: receipt.preparedByName,
    groups: groupLoanItems(receipt.units),
    remarks: [`Barang masuk dari ${ASSET_OWNERSHIP_LABEL[receipt.ownership]}\n${receipt.ownerName}`, receipt.purpose].filter(Boolean).join("\n\n"),
    returnedBy: receipt.senderName,
    receivedBy: receipt.receiverName,
  };

  return (
    <>
      {/* Hanya selama halaman ini terbuka: lembar A4 tegak (halaman cetak lain tetap memakai pengaturan browser). */}
      <style>{"@page { size: A4 portrait; margin: 10mm 12mm; } @media print { html, body { background: #fff !important; } }"}</style>
      <PrintToolbar backHref={`/inventory/penerimaan/${receipt.id}`} />
      <SheetLabel>Lembar 1 dari 2 — asli</SheetLabel>
      <HafSheet data={data} />
      <SheetLabel className="mt-10">Lembar 2 dari 2 — copy</SheetLabel>
      <HafSheet data={data} copy />
    </>
  );
}
