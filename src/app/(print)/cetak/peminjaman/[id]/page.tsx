import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import logo from "@/assets/brand/artha-mitra-logo.png";
import { CopyMark, SheetLabel } from "@/components/print/form-copy";
import { PrintToolbar } from "@/components/print/print-button";
import { requireInventory } from "@/lib/auth/inventory";
import { COMPANY } from "@/lib/company";
import { prisma } from "@/lib/db";
import { formatEnglishDate, formatTrialPeriod, groupLoanItems, loanPurposeText } from "@/lib/demo-loan";
import { getDemoLoanDetail, type LoanDetail } from "@/lib/services/demo-loan-queries";

export const metadata: Metadata = { title: "Product Trial Form" };

/** Lebar kolom tabel unit: Item · Qty · Part Number / Description · Remarks (Remarks = lebar kolom Received By). */
const COLUMNS = "grid-cols-[13mm_14mm_minmax(0,1fr)_60mm]";
const PRINTABLE = new Set(["APPROVED", "ON_LOAN", "PICKUP", "RETURN_REVIEW", "FOLLOW_UP", "RETURNED"]);

/**
 * Product Trial Form siap cetak (Fase 16.3) — tata letak mengikuti form kertas AMI: kop logo + nomor, kotak Date / PIC /
 * Prepared By / Trial Periode, Lend To + up:, unit per part number (Qty & semua S/N), Remarks, tanda tangan
 * Operational / PIC / Item Sender, Received By, alamat kantor. Sekali cetak = 2 lembar A4 (2026-11-19): asli, lalu copy
 * bertanda "COPY" di atas judul. "PIC" (dulu Sales Person) = PIC dari AMI. Bisa dicetak setelah disetujui; semua user
 * Inventaris boleh membuka.
 */
export default async function TrialFormPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInventory("view");
  const { id } = await params;
  const loan = await getDemoLoanDetail(prisma, id);
  if (!loan) notFound();
  const backHref = `/inventory/peminjaman/${loan.id}`;

  if (!PRINTABLE.has(loan.status)) {
    return (
      <>
        <PrintToolbar backHref={backHref} />
        <p className="text-sm">Product Trial Form bisa dicetak setelah peminjaman disetujui.</p>
      </>
    );
  }

  return (
    <>
      <PrintToolbar backHref={backHref} />
      {!loan.itemSenderName && (
        <p role="status" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 print:hidden">
          Item Sender belum dipilih — kolom namanya kosong di form. Pilih dulu di halaman peminjaman bila sudah tahu pengantarnya.
        </p>
      )}
      <SheetLabel>Lembar 1 dari 2 — asli</SheetLabel>
      <TrialFormSheet loan={loan} />
      <SheetLabel className="mt-10">Lembar 2 dari 2 — copy</SheetLabel>
      <TrialFormSheet loan={loan} copy />
    </>
  );
}

/** Satu lembar Product Trial Form (A4). `copy` = lembar salinan: tanda "COPY" di atas judul. */
function TrialFormSheet({ loan, copy = false }: { loan: LoanDetail; copy?: boolean }) {
  const groups = groupLoanItems(loan.items);
  const remarks = [loanPurposeText(loan.purpose, loan.purposeDetail), loan.remarks].filter(Boolean).join("\n");
  const signers = [
    { label: "Operational", name: loan.operationalName },
    { label: "PIC", name: loan.picName },
    { label: "Item Sender", name: loan.itemSenderName },
  ];
  const Title = copy ? "h2" : "h1";

  return (
    // Tinggi cetak sedikit di bawah area A4 (297 − 2×10 mm) supaya pembulatan browser tidak memecah ke lembar berikutnya.
    <article
      aria-label={copy ? "Product Trial Form — copy" : "Product Trial Form — asli"}
      className={`print-trial-form flex min-h-[275mm] flex-col text-[12.5px] leading-snug text-black print:h-[268mm] print:min-h-0 ${copy ? "" : "print:break-after-page"}`}
    >
      <header className="flex items-start justify-between gap-6">
        <Image src={logo} alt="Artha Mitra Interdata" priority={!copy} className="h-auto w-[78mm]" />
        <div className="flex flex-col items-end pt-1 font-serif">
          {copy && <CopyMark />}
          <Title className="text-[25px] leading-none font-bold">Product Trial Form</Title>
          <p className="mt-2 border border-black px-3 py-1 text-[15px] font-bold">
            No. <span className="font-sans tabular-nums">{loan.number}</span>
          </p>
        </div>
      </header>

      <table className="mt-6 ml-auto border-collapse border border-black font-serif text-[13px]">
        <tbody>
          {[
            ["Date", formatEnglishDate(loan.startDate)],
            ["PIC", loan.picName],
            ["Prepared By", loan.requesterName],
            ["Trial Periode", formatTrialPeriod(loan.startDate, loan.dueDate)],
          ].map(([label, value]) => (
            <tr key={label} className="border-b border-black last:border-b-0">
              <th scope="row" className="border-r border-black px-2 py-1 text-right font-bold whitespace-nowrap">
                {label}
              </th>
              <td className="min-w-[68mm] px-2 py-1 font-sans">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5">
        <p className="font-serif font-bold">Lend To :</p>
        <p className="font-semibold">{loan.borrowerName}</p>
        <p className="text-right font-serif">up :</p>
        <p>{loan.contactName}</p>
      </div>

      {/* Tabel unit + tanda tangan: satu kotak bergaris yang mengisi sisa halaman. */}
      <section aria-label="Unit yang dipinjamkan" className="mt-5 flex flex-1 flex-col border border-black">
        <div className={`grid ${COLUMNS} border-b border-black text-center font-serif font-bold`}>
          <div className="border-r border-black py-1.5">Item</div>
          <div className="border-r border-black py-1.5">Qty</div>
          <div className="border-r border-black py-1.5">Part Number / Description</div>
          <div className="py-1.5">Remarks</div>
        </div>
        <div className="relative flex-1">
          {/* Garis kolom sampai bawah, berapa pun jumlah unitnya. */}
          <div aria-hidden className={`pointer-events-none absolute inset-0 grid ${COLUMNS}`}>
            <div className="border-r border-black" />
            <div className="border-r border-black" />
            <div className="border-r border-black" />
            <div />
          </div>
          <div className={`relative grid ${COLUMNS}`}>
            <div className="col-span-3 grid grid-cols-subgrid content-start">
              {groups.map((group, index) => (
                <Fragment key={group.deviceName}>
                  <p className="py-2 text-center">{index + 1}</p>
                  <p className="py-2 text-center tabular-nums">{group.serials.length}</p>
                  <div className="px-3 py-2">
                    <p className="font-semibold">{group.deviceName}</p>
                    {group.serials.map((serial) => (
                      <p key={serial} className="tabular-nums">
                        S/N : {serial}
                      </p>
                    ))}
                  </div>
                </Fragment>
              ))}
            </div>
            <p className="px-3 py-2 whitespace-pre-line">{remarks}</p>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_60mm] border-t border-black">
          <div className="grid grid-cols-3">
            {signers.map((signer) => (
              <div key={signer.label} className="flex h-[38mm] flex-col items-center justify-between border-r border-black px-2 pt-1.5 pb-2 text-center">
                <p className="font-serif">{signer.label}</p>
                <p className="min-h-[1.4em] w-full border-t border-dotted border-black/60 pt-1 font-semibold">{signer.name ?? ""}</p>
              </div>
            ))}
          </div>
          <div className="flex h-[38mm] flex-col px-3 pt-1.5 pb-2">
            <p className="text-center font-serif font-bold">Received By,</p>
            <div className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1.5 font-serif">
              <span className="font-bold">Name</span>
              <span className="border-b border-dotted border-black/60 font-sans">: {loan.receivedByName ?? ""}</span>
              <span className="font-bold">Date</span>
              <span className="border-b border-dotted border-black/60 font-sans">: {loan.deliveredAt ? formatEnglishDate(loan.deliveredAt) : ""}</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-3 text-[11px] leading-tight font-semibold">
        {COMPANY.addressLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p>Telp. : {COMPANY.phone}</p>
        <p>Fax : {COMPANY.fax}</p>
        <p>E-Mail : {COMPANY.email}</p>
      </footer>
    </article>
  );
}
