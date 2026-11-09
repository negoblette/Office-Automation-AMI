import type { Metadata } from "next";
import { Fragment } from "react";
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

  return (
    <section className={pageBreak ? "mt-10 break-before-page" : undefined}>
      <header className="mb-5 border-b-2 border-black pb-3">
        <p className="text-xs font-bold tracking-widest">PT ARTHA MITRA INTERDATA</p>
        <h1 className="text-2xl font-bold">Rekap Reimburse</h1>
        <p className="mt-1 text-sm">
          {first.employeeName}
          {first.employeeNo && ` (${first.employeeNo})`} · {first.employeePosition} · {first.division}
        </p>
        <p className="text-xs">Pengajuan: {numbers.join(", ")}</p>
      </header>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-black text-left">
            {["Tanggal", "No. Pengajuan", "Perusahaan / Project", "Aktivitas", "Nama – Jabatan", "Lokasi", "Tipe", "Pembayaran", "Status", "Total"].map((h) => (
              <th key={h} className={`py-1.5 pr-2 font-semibold ${h === "Total" ? "text-right" : ""}`}>
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
                  <tr key={r.id} className="border-b border-black/20 align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{formatDate(`${r.date}T00:00:00Z`, "short")}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{r.number}</td>
                    <td className="py-1.5 pr-2">
                      {r.customerName ?? "—"}
                      {r.projectName && <div className="text-black/60">{r.projectName}</div>}
                    </td>
                    <td className="py-1.5 pr-2">{r.activity}</td>
                    <td className="py-1.5 pr-2 whitespace-pre-line">{r.participants}</td>
                    <td className="py-1.5 pr-2">{r.location}</td>
                    <td className="py-1.5 pr-2">{r.typeName}</td>
                    <td className="py-1.5 pr-2">{PAYMENT_METHOD_LABEL[r.paymentMethod]}</td>
                    <td className="py-1.5 pr-2">{STATUS_LABEL[r.status]}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatRupiah(r.amount)}</td>
                  </tr>
                ))}
              <tr className="border-b border-black/40 bg-black/5">
                <td colSpan={9} className="py-1 pr-2 text-right font-medium">
                  Subtotal {formatDate(`${day.date}T00:00:00Z`, "short")}
                </td>
                <td className="py-1 text-right font-semibold tabular-nums">{formatRupiah(day.amount)}</td>
              </tr>
            </Fragment>
          ))}
        </tbody>
        <tfoot className="text-sm">
          <tr>
            <td colSpan={9} className="pt-3 pr-2 text-right">Total Pribadi (dibayarkan ke karyawan)</td>
            <td className="pt-3 text-right font-semibold tabular-nums">{formatRupiah(totals.personal)}</td>
          </tr>
          <tr>
            <td colSpan={9} className="pr-2 text-right">Total Perusahaan</td>
            <td className="text-right font-semibold tabular-nums">{formatRupiah(totals.corporate)}</td>
          </tr>
          <tr className="text-base">
            <td colSpan={9} className="pt-1 pr-2 text-right font-bold">Total</td>
            <td className="pt-1 text-right font-bold tabular-nums">{formatRupiah(totals.total)}</td>
          </tr>
        </tfoot>
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
