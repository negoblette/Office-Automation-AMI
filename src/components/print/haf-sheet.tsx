// Satu lembar Hardware Admission Form (A4), meniru form kertas AMI. HAF mendata semua barang yang MASUK ke AMI
// (2026-11-20): unit pinjaman yang diambil kembali dari peminjam (/cetak/peminjaman/[id]/haf) dan barang yang dipinjam
// AMI dari principal / distributor (/cetak/penerimaan/[id]). Halaman cetak merender 2 lembar: asli, lalu copy.
import Image from "next/image";
import { Fragment } from "react";
import logo from "@/assets/brand/artha-mitra-logo.png";
import { COMPANY } from "@/lib/company";
import { CopyMark } from "./form-copy";

/** Lebar kolom tabel unit: Item · Qty · Part Number / Description · Remarks (Remarks = lebar kolom Received By). */
const COLUMNS = "grid-cols-[13mm_14mm_minmax(0,1fr)_60mm]";

export type HafSheetData = {
  number: string;
  /** "From :" (pengirim barang) & "up :" (kontaknya). */
  from: string;
  contact: string;
  /** Tanggal di kotak Date & kolom tanda tangan (sudah diformat bahasa Inggris). */
  date: string;
  pic: string;
  preparedBy: string;
  /** Unit per part number, urutan kemunculan. */
  groups: { deviceName: string; serials: string[] }[];
  remarks: string;
  returnedBy: string | null;
  receivedBy: string | null;
};

/** `copy` = lembar salinan: tanda "COPY" di atas judul. */
export function HafSheet({ data, copy = false }: { data: HafSheetData; copy?: boolean }) {
  const Title = copy ? "h2" : "h1";
  return (
    // Tinggi cetak sedikit di bawah area A4 (297 − 2×10 mm) supaya pembulatan browser tidak memecah ke lembar berikutnya.
    <article
      aria-label={copy ? "Hardware Admission Form — copy" : "Hardware Admission Form — asli"}
      className={`flex min-h-[275mm] flex-col text-[12.5px] leading-snug text-black print:h-[268mm] print:min-h-0 ${copy ? "" : "print:break-after-page"}`}
    >
      <header className="flex items-start justify-between gap-6">
        <Image src={logo} alt="Artha Mitra Interdata" priority={!copy} className="h-auto w-[78mm]" />
        <div className="flex flex-col items-end pt-1 font-serif">
          {copy && <CopyMark />}
          <Title className="text-[25px] leading-none font-bold">Hardware Admission Form</Title>
          <p className="mt-2 border border-black px-3 py-1 text-[15px] font-bold">
            No. <span className="font-sans tabular-nums">{data.number}</span>
          </p>
        </div>
      </header>

      <div className="mt-6 flex items-end justify-between gap-6">
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 self-end">
          <p className="font-serif font-bold">From :</p>
          <p className="font-semibold wrap-anywhere">{data.from}</p>
          <p className="text-right font-serif">up :</p>
          <p className="wrap-anywhere">{data.contact}</p>
        </div>
        <table className="shrink-0 border-collapse border border-black font-serif text-[13px]">
          <tbody>
            {[
              ["Date", data.date],
              ["PIC", data.pic],
              ["Prepared By", data.preparedBy],
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
      <section aria-label="Unit yang masuk" className="mt-5 flex flex-1 flex-col border border-black">
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
              {data.groups.map((group, index) => (
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
            <p className="px-3 py-2 wrap-anywhere whitespace-pre-line">{data.remarks}</p>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_60mm] border-t border-black">
          <SignBox title="Returned By," name={data.returnedBy} date={data.date} className="border-r border-black" />
          <SignBox title="Received By," name={data.receivedBy} date={data.date} />
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
