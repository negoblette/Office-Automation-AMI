import type { Metadata } from "next";
import { Fragment } from "react";
import { PrintLetterhead } from "@/components/print/letterhead";
import { PrintPageSetup } from "@/components/print/page-setup";
import { PrintToolbar } from "@/components/print/print-button";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { parseExportIds } from "@/lib/export-ids";
import { formatDate, formatRupiah } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { listReimburseExportRows, type ReimburseExportRow } from "@/lib/services/reimburse-export";
import { dailySubtotals, reimbursementTotals } from "@/lib/validators/reimbursement";

export const metadata: Metadata = { title: "Rekap Reimburse" };

const STATUS_LABEL = { PENDING: "Menunggu", APPROVED: "Disetujui", REJECTED: "Ditolak", DRAFT: "Draft" } as const;

/**
 * Ekspor PDF reimburse yang dipilih (2026-11-09: `?ids=`, dari panel "Pilih & Ekspor" atau detail pengajuan). Satu bagian
 * per karyawan dengan subtotal harian & kolom tanda tangan; dialog cetak langsung terbuka untuk disimpan sebagai PDF.
 * Selain Admin hanya miliknya sendiri (dicek di query).
 */
export default async function CetakReimbursePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const user = await requireUser();
  const { ids } = await searchParams;
  const rows = await listReimburseExportRows(prisma, user, parseExportIds(ids));

  if (rows.length === 0) {
    return (
      <>
        <PrintToolbar backHref="/reimburse" />
        <p className="text-sm">Tidak ada reimburse untuk diekspor. Pilih pengajuan dari halaman Reimburse (tombol &ldquo;Pilih & Ekspor&rdquo;).</p>
      </>
    );
  }

  const byEmployee = new Map<string, ReimburseExportRow[]>();
  for (const row of rows) byEmployee.set(row.employeeId, [...(byEmployee.get(row.employeeId) ?? []), row]);

  return (
    <>
      {/* 10 kolom tidak muat di A4 tegak (kolom terlalu sempit, 2026-11-20) → lembar mendatar. */}
      <PrintPageSetup orientation="landscape" />
      <PrintToolbar backHref="/reimburse" autoPrint />
      {[...byEmployee.values()].map((list, index) => (
        <EmployeeSection key={list[0].employeeId} rows={list} pageBreak={index > 0} />
      ))}
    </>
  );
}

function EmployeeSection({ rows, pageBreak }: { rows: ReimburseExportRow[]; pageBreak: boolean }) {
  const first = rows[0];
  const totals = reimbursementTotals(rows);
  const days = dailySubtotals(rows);
  const numbers = [...new Set(rows.map((r) => r.number))];
  // Satu pengajuan: nomornya sudah di kop, kolom No. Pengajuan tidak perlu diulang di setiap baris.
  const showNumber = numbers.length > 1;
  const headers = ["Tanggal", ...(showNumber ? ["No. Pengajuan"] : []), "Perusahaan / Project", "Aktivitas", "Nama – Jabatan", "Lokasi", "Tipe", "Pembayaran", "Status", "Total"];
  const labelSpan = headers.length - 1;

  return (
    <section className={pageBreak ? "mt-10 break-before-page" : undefined}>
      <PrintLetterhead title="Rekap Reimburse">
        <p className="mt-1 text-sm">
          {first.employeeName}
          {first.employeeNo && ` (${first.employeeNo})`} · {first.employeePosition} · {first.division}
        </p>
        <p className="text-xs">Pengajuan: {numbers.join(", ")}</p>
      </PrintLetterhead>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-black text-left">
            {headers.map((h) => (
              <th key={h} className={`py-1.5 pr-2 font-semibold ${h === "Total" ? "pr-0 text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <Fragment key={day.date}>
              {rows
                .filter((r) => r.date === day.date)
                .map((r) => (
                  <tr key={r.id} className="border-b border-black/20 align-top break-inside-avoid">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{formatDate(`${r.date}T00:00:00Z`, "short")}</td>
                    {showNumber && <td className="py-1.5 pr-2 whitespace-nowrap">{r.number}</td>}
                    <td className="min-w-[45mm] py-1.5 pr-2">
                      {r.customerName ?? "—"}
                      {r.projectName && <div className="text-black/60">{r.projectName}</div>}
                    </td>
                    <td className="min-w-[35mm] py-1.5 pr-2">{r.activity}</td>
                    <td className="py-1.5 pr-2 whitespace-pre-line">{r.participants}</td>
                    <td className="py-1.5 pr-2">{r.location}</td>
                    <td className="py-1.5 pr-2">{r.typeName}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{PAYMENT_METHOD_LABEL[r.paymentMethod]}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{STATUS_LABEL[r.status]}</td>
                    <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{formatRupiah(r.amount)}</td>
                  </tr>
                ))}
              <tr className="border-b border-black/40 bg-black/5 break-inside-avoid">
                <td colSpan={labelSpan} className="py-1 pr-2 text-right font-medium">
                  Subtotal {formatDate(`${day.date}T00:00:00Z`, "short")}
                </td>
                <td className="py-1 text-right font-semibold whitespace-nowrap tabular-nums">{formatRupiah(day.amount)}</td>
              </tr>
            </Fragment>
          ))}
        </tbody>
        {/* Bukan <tfoot>: tfoot diulang Chrome di bawah setiap lembar — total cukup sekali di akhir. */}
        <tbody className="text-sm break-inside-avoid">
          <tr>
            <td colSpan={labelSpan} className="pt-3 pr-2 text-right">Total Pribadi (dibayarkan ke karyawan)</td>
            <td className="pt-3 text-right font-semibold whitespace-nowrap tabular-nums">{formatRupiah(totals.personal)}</td>
          </tr>
          <tr>
            <td colSpan={labelSpan} className="pr-2 text-right">Total Perusahaan</td>
            <td className="text-right font-semibold whitespace-nowrap tabular-nums">{formatRupiah(totals.corporate)}</td>
          </tr>
          <tr className="text-base">
            <td colSpan={labelSpan} className="pt-1 pr-2 text-right font-bold">Total</td>
            <td className="pt-1 text-right font-bold whitespace-nowrap tabular-nums">{formatRupiah(totals.total)}</td>
          </tr>
        </tbody>
      </table>

      <footer className="mt-12 grid grid-cols-3 gap-8 text-center text-xs break-inside-avoid">
        {["Diajukan", "Diperiksa", "Disetujui"].map((label, i) => (
          <div key={label}>
            <p>{label}</p>
            <div className="mt-14 border-t border-black pt-1">{i === 0 ? first.employeeName : " "}</div>
          </div>
        ))}
      </footer>
    </section>
  );
}
