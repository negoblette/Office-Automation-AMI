import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PrintToolbar } from "@/components/print/print-button";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDate, formatRupiah, toJakartaIsoDate } from "@/lib/format";
import { divisionLabels } from "@/lib/services/division";
import { getHealthPrintData } from "@/lib/services/health-queries";

export const metadata: Metadata = { title: "Rekap Klaim Kesehatan" };

const STATUS_LABEL = { PENDING: "Menunggu", APPROVED: "Disetujui", REJECTED: "Ditolak", DRAFT: "Draft" } as const;

/**
 * Rekap klaim kesehatan per orang per tahun untuk dicetak / disimpan PDF (2026-10-16).
 * Admin boleh memilih karyawan; selain Admin hanya rekap dirinya sendiri.
 */
export default async function CetakKesehatanPage({ searchParams }: { searchParams: Promise<{ karyawan?: string; tahun?: string }> }) {
  const user = await requireUser();
  const { karyawan, tahun } = await searchParams;
  if (karyawan && karyawan !== user.employeeId && user.role !== "ADMIN") redirect("/akses-ditolak");
  const employeeId = user.role === "ADMIN" && karyawan ? karyawan : user.employeeId;
  if (!employeeId) redirect("/akses-ditolak");
  const thisYear = Number(toJakartaIsoDate().slice(0, 4));
  const year = tahun && /^\d{4}$/.test(tahun) && Number(tahun) <= thisYear ? Number(tahun) : thisYear;

  const data = await getHealthPrintData(prisma, employeeId, year);
  if (!data) notFound();
  const { employee, rows, summary } = data;

  return (
    <>
      <PrintToolbar backHref="/kesehatan" />
      <header className="mb-5 border-b-2 border-black pb-3">
        <p className="text-xs font-bold tracking-widest">PT ARTHA MITRA INTERDATA</p>
        <h1 className="text-2xl font-bold">Rekap Klaim Kesehatan — {year}</h1>
        <p className="mt-1 text-sm">
          {employee.fullName}
          {employee.employeeNo && ` (${employee.employeeNo})`} · {employee.position} · {(await divisionLabels(prisma))[employee.division] ?? employee.division}
        </p>
      </header>

      <section className="mb-5 grid grid-cols-4 gap-3 text-sm break-inside-avoid">
        {[
          ["Plafon tahunan", summary.annual === null ? "Belum diatur" : formatRupiah(summary.annual)],
          ["Terpakai (disetujui)", formatRupiah(summary.approved)],
          ["Menunggu approval", formatRupiah(summary.pending)],
          ["Sisa plafon", summary.remaining === null ? "—" : formatRupiah(summary.remaining)],
        ].map(([label, value]) => (
          <div key={label} className="border border-black/40 p-2">
            <p className="text-xs">{label}</p>
            <p className="font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      {rows.length === 0 ? (
        <p className="text-sm">Belum ada klaim kesehatan di tahun ini.</p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-black text-left">
              {["Tanggal", "No. Klaim", "Kategori", "Keterangan", "Status", "Pembayaran", "Diajukan", "Disetujui"].map((h) => (
                <th key={h} className={`py-1.5 pr-2 font-semibold ${h === "Diajukan" || h === "Disetujui" ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-black/20 align-top">
                <td className="py-1.5 pr-2 whitespace-nowrap">{formatDate(`${r.claimDate}T00:00:00Z`, "short")}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap">{r.number}</td>
                <td className="py-1.5 pr-2">{r.category}</td>
                <td className="py-1.5 pr-2">{r.note ?? "—"}</td>
                <td className="py-1.5 pr-2">{STATUS_LABEL[r.status]}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  {r.payout
                    ? `${new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${r.payout.month}-01T00:00:00Z`))}${r.payout.paid ? " · dibayar" : ""}`
                    : "—"}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatRupiah(r.amount)}</td>
                <td className="py-1.5 text-right tabular-nums">{r.approvedAmount === null ? "—" : formatRupiah(r.approvedAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-sm">
            <tr>
              <td colSpan={7} className="pt-3 pr-2 text-right font-bold">Total disetujui</td>
              <td className="pt-3 text-right font-bold tabular-nums">{formatRupiah(summary.approved)}</td>
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
