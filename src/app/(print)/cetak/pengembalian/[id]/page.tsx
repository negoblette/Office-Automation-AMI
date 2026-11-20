import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SheetLabel } from "@/components/print/form-copy";
import { HafSheet, type HafSheetData } from "@/components/print/haf-sheet";
import { PrintToolbar } from "@/components/print/print-button";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { formatEnglishDate, groupLoanItems } from "@/lib/demo-loan";
import { ASSET_OWNERSHIP_LABEL } from "@/lib/inventory";
import { getGoodsReturn } from "@/lib/services/goods-receipt-queries";

export const metadata: Metadata = { title: "Hardware Admission Form" };

/**
 * Hardware Admission Form pengembalian barang ke principal / distributor (2026-11-20, keputusan user: pakai HAF):
 * To = principal / distributor + up: kontak, Date = tanggal dikembalikan, PIC penerimaan, Prepared By = Operational,
 * unit per part number, Remarks (rujukan HAF penerimaan + catatan), Returned By = karyawan AMI yang menyerahkan,
 * Received By = penerima di principal. Asli + copy. Semua user Inventaris boleh membuka.
 */
export default async function GoodsReturnHafPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInventory("view");
  const { id } = await params;
  const goodsReturn = await getGoodsReturn(prisma, id);
  if (!goodsReturn) notFound();

  const data: HafSheetData = {
    number: goodsReturn.hafNumber,
    partyLabel: "To",
    from: goodsReturn.receipt.ownerName,
    contact: goodsReturn.contactName,
    date: formatEnglishDate(goodsReturn.returnedDate),
    pic: goodsReturn.receipt.picName,
    preparedBy: goodsReturn.preparedByName,
    groups: groupLoanItems(goodsReturn.units),
    remarks: [
      `Pengembalian barang ke ${ASSET_OWNERSHIP_LABEL[goodsReturn.receipt.ownership]}\n${goodsReturn.receipt.ownerName}`,
      `Diterima AMI dengan HAF\n${goodsReturn.receipt.hafNumber}`,
      goodsReturn.note,
    ]
      .filter(Boolean)
      .join("\n\n"),
    returnedBy: goodsReturn.returnedByName,
    receivedBy: goodsReturn.receivedByName,
  };

  return (
    <>
      <PrintToolbar backHref={`/inventory/penerimaan/${goodsReturn.receipt.id}`} />
      <SheetLabel>Lembar 1 dari 2 — asli</SheetLabel>
      <HafSheet data={data} />
      <SheetLabel className="mt-10">Lembar 2 dari 2 — copy</SheetLabel>
      <HafSheet data={data} copy />
    </>
  );
}
