import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import logo from "@/assets/brand/artha-mitra-logo.png";
import { PrintToolbar } from "@/components/print/print-button";
import { requireInventory } from "@/lib/auth/inventory";
import { COMPANY } from "@/lib/company";
import { prisma } from "@/lib/db";
import { formatEnglishDate, loanPurposeText, RETURN_CONDITION_ENGLISH } from "@/lib/demo-loan";
import { getDemoLoanDetail, type LoanItemView } from "@/lib/services/demo-loan-queries";

export const metadata: Metadata = { title: "Hardware Admission Form" };

/** Lebar kolom tabel unit: Item · Qty · Part Number / Description · Remarks (Remarks = lebar kolom Received By). */
const COLUMNS = "grid-cols-[13mm_14mm_minmax(0,1fr)_60mm]";

/** Unit per part number, urutan kemunculan dipertahankan (sama dengan Product Trial Form). */
function groupByDevice(items: LoanItemView[]) {
  const groups = new Map<string, LoanItemView[]>();
  for (const item of items) groups.set(item.deviceName, [...(groups.get(item.deviceName) ?? []), item]);
  return [...groups].map(([deviceName, units]) => ({ deviceName, units }));
}

/**
 * Hardware Admission Form siap cetak (Tahap 16.5) — tanda terima barang pinjaman yang sudah kembali & dicek Operational.
 * Tata letak mengikuti form kertas AMI: kop logo + nomor, kotak Date / Sales Person / Prepared By, From + up:, unit per
 * part number (Qty, S/N + kondisi saat dicek), Remarks (rujukan PTF, kegunaan, catatan), Returned By / Received By,
 * alamat kantor. Satu lembar A4. Hanya untuk peminjaman yang sudah dikembalikan; semua user Inventaris boleh membuka.
 */
export default async function HardwareAdmissionPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInventory("view");
  const { id } = await params;
  const loan = await getDemoLoanDetail(prisma, id);
  if (!loan) notFound();
  const backHref = `/inventory/peminjaman/${loan.id}`;

  if (loan.status !== "RETURNED" || !loan.hafNumber || !loan.returnedAt) {
    return (
      <>
        <PrintToolbar backHref={backHref} />
        <p className="text-sm">Hardware Admission Form terbit setelah pengembalian barang dicatat Operational.</p>
      </>
    );
  }

  const groups = groupByDevice(loan.items);
  const remarks = [`Ref. Product Trial Form\nNo. ${loan.number}`, loanPurposeText(loan.purpose, loan.purposeDetail), loan.returnNote].filter(Boolean).join("\n\n");
  const returnedOn = formatEnglishDate(loan.returnedAt);

  return (
    <>
      {/* Hanya selama halaman ini terbuka: satu lembar A4 tegak (halaman cetak lain tetap memakai pengaturan browser). */}
      <style>{"@page { size: A4 portrait; margin: 10mm 12mm; } @media print { html, body { background: #fff !important; } }"}</style>
      <PrintToolbar backHref={backHref} />

      {/* Tinggi cetak sedikit di bawah area A4 (297 − 2×10 mm) supaya pembulatan browser tidak memecah ke lembar kedua. */}
      <article className="flex min-h-[275mm] flex-col text-[12.5px] leading-snug text-black print:h-[268mm] print:min-h-0">
        <header className="flex items-start justify-between gap-6">
          <Image src={logo} alt="Artha Mitra Interdata" priority className="h-auto w-[78mm]" />
          <div className="flex flex-col items-end pt-1 font-serif">
            <h1 className="text-[25px] leading-none font-bold">Hardware Admission Form</h1>
            <p className="mt-2 border border-black px-3 py-1 text-[15px] font-bold">
              No. <span className="font-sans tabular-nums">{loan.hafNumber}</span>
            </p>
          </div>
        </header>

        <div className="mt-6 flex items-end justify-between gap-6">
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 self-end">
            <p className="font-serif font-bold">From :</p>
            <p className="font-semibold wrap-anywhere">{loan.borrowerName}</p>
            <p className="text-right font-serif">up :</p>
            <p className="wrap-anywhere">{loan.picName}</p>
          </div>
          <table className="shrink-0 border-collapse border border-black font-serif text-[13px]">
            <tbody>
              {[
                ["Date", returnedOn],
                ["Sales Person", loan.salesPersonName],
                ["Prepared By", loan.returnReceiverName ?? ""],
              ].map(([label, value]) => (
                <tr key={label} className="border-b border-black last:border-b-0">
                  <th scope="row" className="border-r border-black px-2 py-1 text-right font-bold whitespace-nowrap">
                    {label}
                  </th>
                  <td className="min-w-[60mm] px-2 py-1 font-sans">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Tabel unit + tanda tangan: satu kotak bergaris yang mengisi sisa halaman. */}
        <section aria-label="Unit yang diterima kembali" className="mt-5 flex flex-1 flex-col border border-black">
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
                    <p className="py-2 text-center tabular-nums">{group.units.length}</p>
                    <div className="px-3 py-2">
                      <p className="font-semibold">{group.deviceName}</p>
                      {group.units.map((unit) => (
                        <div key={unit.id}>
                          <p className="tabular-nums">
                            S/N : {unit.serialNo}
                            {unit.returnCondition && <span className={unit.returnCondition === "GOOD" ? "" : "font-bold"}> — {RETURN_CONDITION_ENGLISH[unit.returnCondition]}</span>}
                          </p>
                          {unit.returnNote && <p className="pl-[3.2em] text-[11.5px] wrap-anywhere italic">{unit.returnNote}</p>}
                        </div>
                      ))}
                    </div>
                  </Fragment>
                ))}
              </div>
              <p className="px-3 py-2 wrap-anywhere whitespace-pre-line">{remarks}</p>
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_60mm] border-t border-black">
            <SignBox title="Returned By," name={loan.returnedByName} date={returnedOn} className="border-r border-black" />
            <SignBox title="Received By," name={loan.returnReceiverName} date={returnedOn} />
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
    </>
  );
}

/** Kotak tanda tangan: judul di atas, ruang tanda tangan, lalu Name / Date di bawah. */
function SignBox({ title, name, date, className }: { title: string; name: string | null; date: string; className?: string }) {
  return (
    <div className={`flex h-[38mm] flex-col px-3 pt-1.5 pb-2 ${className ?? ""}`}>
      <p className="text-center font-serif font-bold">{title}</p>
      <div className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1.5 font-serif">
        <span className="font-bold">Name</span>
        <span className="border-b border-dotted border-black/60 font-sans">: {name ?? ""}</span>
        <span className="font-bold">Date</span>
        <span className="border-b border-dotted border-black/60 font-sans">: {date}</span>
      </div>
    </div>
  );
}
