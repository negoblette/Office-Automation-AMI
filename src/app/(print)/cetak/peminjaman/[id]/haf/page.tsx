import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SheetLabel } from "@/components/print/form-copy";
import { HafSheet, type HafSheetData } from "@/components/print/haf-sheet";
import { PrintToolbar } from "@/components/print/print-button";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { formatEnglishDate, groupLoanItems, loanPurposeText } from "@/lib/demo-loan";
import { getDemoLoanDetail } from "@/lib/services/demo-loan-queries";

export const metadata: Metadata = { title: "Hardware Admission Form" };

/**
 * Hardware Admission Form pengambilan peminjaman (Tahap 16.5; revisi 2026-11-19) — terbit saat Operational menjadwalkan
 * pengambilan dan DIBAWA KURIR AMI ke peminjam, jadi isinya data sebelum barang dicek: From = peminjam + up:, Date =
 * tanggal pengambilan, PIC, Prepared By = Operational yang menerbitkan, unit per part number (Qty & S/N), Remarks
 * (rujukan PTF & kegunaan), Returned By (peminjam, ditandatangani di tempat) / Received By (kurir). Hasil Pengecekan
 * Unit tercatat di sistem, tidak di form ini. Sekali cetak = 2 lembar A4 (asli + copy). Semua user Inventaris boleh membuka.
 */
export default async function HardwareAdmissionPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInventory("view");
  const { id } = await params;
  const loan = await getDemoLoanDetail(prisma, id);
  if (!loan) notFound();
  const backHref = `/inventory/peminjaman/${loan.id}`;

  if (!["PICKUP", "RETURN_REVIEW", "FOLLOW_UP", "RETURNED"].includes(loan.status) || !loan.hafNumber) {
    return (
      <>
        <PrintToolbar backHref={backHref} />
        <p className="text-sm">Hardware Admission Form terbit setelah Operational menjadwalkan pengambilan barang.</p>
      </>
    );
  }

  // Tanggal pengambilan; peminjaman lama (sebelum 2026-11-19) belum punya → tanggal kembali.
  const dateIso = loan.pickupDate ?? loan.returnedAt;
  const data: HafSheetData = {
    number: loan.hafNumber,
    from: loan.borrowerName,
    contact: loan.contactName,
    date: dateIso ? formatEnglishDate(dateIso) : "",
    pic: loan.picName,
    preparedBy: loan.hafPreparerName ?? loan.returnReceiverName ?? "",
    groups: groupLoanItems(loan.items),
    remarks: [`Ref. Product Trial Form\nNo. ${loan.number}`, loanPurposeText(loan.purpose, loan.purposeDetail)].join("\n\n"),
    returnedBy: loan.returnedByName,
    receivedBy: loan.courierName ?? loan.returnReceiverName,
  };

  return (
    <>
      {/* Hanya selama halaman ini terbuka: lembar A4 tegak (halaman cetak lain tetap memakai pengaturan browser). */}
      <style>{"@page { size: A4 portrait; margin: 10mm 12mm; } @media print { html, body { background: #fff !important; } }"}</style>
      <PrintToolbar backHref={backHref} />
      <SheetLabel>Lembar 1 dari 2 — asli</SheetLabel>
      <HafSheet data={data} />
      <SheetLabel className="mt-10">Lembar 2 dari 2 — copy</SheetLabel>
      <HafSheet data={data} copy />
    </>
  );
}
