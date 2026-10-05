import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Fragment } from "react";
import { PrintToolbar } from "@/components/print/print-button";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDate, formatRupiah, toJakartaIsoDate } from "@/lib/format";
import { DIVISION_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { getReimbursePrintData } from "@/lib/services/reimbursement-queries";
import { dailySubtotals, reimbursementTotals } from "@/lib/validators/reimbursement";

export const metadata: Metadata = { title: "Rekap Reimburse" };

const STATUS_LABEL = { PENDING: "Menunggu", APPROVED: "Disetujui", REJECTED: "Ditolak", DRAFT: "Draft" } as const;

/**
 * Rekap reimburse per orang per bulan untuk dicetak / disimpan PDF (Fase 14).
 * Admin boleh memilih karyawan; selain Admin hanya rekap dirinya sendiri.
 */
export default async function CetakReimbursePage({ searchParams }: { searchParams: Promise<{ karyawan?: string; bulan?: string }> }) {
  const user = await requireUser();
  const { karyawan, bulan } = await searchParams;
  const employeeId = user.role === "ADMIN" && karyawan ? karyawan : user.employeeId;
  if (!employeeId) redirect("/akses-ditolak");
  if (karyawan && karyawan !== user.employeeId && user.role !== "ADMIN") redirect("/akses-ditolak");
  const yearMonth = bulan && /^\d{4}-(0[1-9]|1[0-2])$/.test(bulan) ? bulan : toJakartaIsoDate().slice(0, 7);

  const data = await getReimbursePrintData(prisma, employeeId, yearMonth);
  if (!data) notFound();
  const { employee, rows } = data;
  const totals = reimbursementTotals(rows);
  const days = dailySubtotals(rows);
  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${yearMonth}-01T00:00:00Z`));

  return (
    <>
      <PrintToolbar backHref="/reimburse" />
      <header className="mb-5 border-b-2 border-black pb-3">
        <p className="text-xs font-bold tracking-widest">PT ARTHA MITRA INTERDATA</p>
        <h1 className="text-2xl font-bold">Rekap Reimburse — {monthLabel}</h1>
        <p className="mt-1 text-sm">
          {employee.fullName}
          {employee.employeeNo && ` (${employee.employeeNo})`} · {employee.position} · {DIVISION_LABEL[employee.division]}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm">Tidak ada reimburse yang diajukan untuk transaksi bulan ini.</p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-black text-left">
              {["Tanggal", "No. Pengajuan", "Company / Project", "Aktivitas", "Names – Position", "Lokasi", "Tipe", "Payment", "Status", "Total"].map((h) => (
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
              <td colSpan={9} className="pt-3 pr-2 text-right">Total Cash (dibayarkan ke karyawan)</td>
              <td className="pt-3 text-right font-semibold tabular-nums">{formatRupiah(totals.cash)}</td>
            </tr>
            <tr>
              <td colSpan={9} className="pr-2 text-right">Total Kartu Kredit</td>
              <td className="text-right font-semibold tabular-nums">{formatRupiah(totals.cc)}</td>
            </tr>
            <tr className="text-base">
              <td colSpan={9} className="pt-1 pr-2 text-right font-bold">Total</td>
              <td className="pt-1 text-right font-bold tabular-nums">{formatRupiah(totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <footer className="mt-12 grid grid-cols-3 gap-8 text-center text-xs break-inside-avoid">
        {["Diajukan", "Diperiksa", "Disetujui"].map((label, i) => (
          <div key={label}>
            <p>{label}</p>
            <div className="mt-14 border-t border-black pt-1">{i === 0 ? employee.fullName : " "}</div>
          </div>
        ))}
      </footer>
    </>
  );
}
