import type { Metadata } from "next";
import { PrintToolbar } from "@/components/print/print-button";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { parseExportIds } from "@/lib/export-ids";
import { formatDate, formatRupiah } from "@/lib/format";
import { divisionLabels } from "@/lib/services/division";
import { getHealthPrintData, HEALTH_MONTH, healthExportGroups, healthMonthlyGroups } from "@/lib/services/health-queries";

export const metadata: Metadata = { title: "Rekap Klaim Kesehatan" };

const STATUS_LABEL = { PENDING: "Menunggu", APPROVED: "Disetujui", REJECTED: "Ditolak", DRAFT: "Draft" } as const;

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
const EMPLOYEE_ID = /^[\w-]{1,64}$/;

/**
 * Ekspor PDF klaim kesehatan, dua cara:
 *  - `?ids=` (2026-11-09): klaim yang dipilih di panel "Pilih & Ekspor" / tombol per klaim;
 *  - `?bulan=YYYY-MM[&karyawan=<id>]` (2026-11-19): rekap bulanan — semua klaim menunggu / disetujui yang tanggal klaimnya di
 *    bulan itu, satu karyawan atau semua karyawan (Admin; ada ringkasan per karyawan di halaman pertama).
 * Satu bagian per karyawan: ringkasan plafon tahun itu (semua klaim) + klaim yang dimaksud; dialog cetak langsung terbuka
 * untuk disimpan sebagai PDF. Selain Admin hanya miliknya sendiri (dicek di query, parameter karyawan diabaikan).
 */
export default async function CetakKesehatanPage({ searchParams }: { searchParams: Promise<{ ids?: string; bulan?: string; karyawan?: string }> }) {
  const user = await requireUser();
  const { ids, bulan, karyawan } = await searchParams;
  const month = typeof bulan === "string" && HEALTH_MONTH.test(bulan) ? bulan : null;
  const employeeId = typeof karyawan === "string" && EMPLOYEE_ID.test(karyawan) ? karyawan : null;
  const groups = month ? await healthMonthlyGroups(prisma, user, { month, employeeId }) : await healthExportGroups(prisma, user, parseExportIds(ids));

  if (groups.length === 0) {
    return (
      <>
        <PrintToolbar backHref="/kesehatan" />
        <p className="text-sm">
          {month
            ? `Tidak ada klaim menunggu / disetujui dengan tanggal klaim di ${monthLabel(month)}.`
            : "Tidak ada klaim untuk diekspor. Pilih klaim dari halaman Kesehatan (tombol “Pilih & Ekspor”)."}
        </p>
      </>
    );
  }

  const [divisions, sections] = await Promise.all([
    divisionLabels(prisma),
    Promise.all(groups.map(async (group) => ({ group, data: (await getHealthPrintData(prisma, group.employeeId, group.year))! }))),
  ]);
  // Ringkasan bulanan semua karyawan (halaman pertama): jumlah klaim, diajukan, disetujui per karyawan.
  const recap = sections.map(({ group, data }) => {
    const rows = data.rows.filter((r) => group.claimIds.has(r.id));
    return {
      employeeId: group.employeeId,
      name: data.employee.fullName,
      count: rows.length,
      requested: rows.reduce((n, r) => n + r.amount, 0),
      approved: rows.filter((r) => r.status === "APPROVED").reduce((n, r) => n + (r.approvedAmount ?? r.amount), 0),
      pending: rows.filter((r) => r.status === "PENDING").length,
    };
  });

  return (
    <>
      <PrintToolbar backHref="/kesehatan" autoPrint />
      {month && sections.length > 1 && (
        <section className="mb-10 break-after-page">
          <header className="mb-5 border-b-2 border-black pb-3">
            <p className="text-xs font-bold tracking-widest">PT ARTHA MITRA INTERDATA</p>
            <h1 className="text-2xl font-bold">Rekap Klaim Kesehatan — {monthLabel(month)}</h1>
            <p className="mt-1 text-sm">Semua karyawan · klaim menunggu / disetujui berdasarkan tanggal klaim · rincian per karyawan di halaman berikutnya</p>
          </header>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-black text-left">
                {["Karyawan", "Jumlah klaim", "Menunggu", "Diajukan", "Disetujui"].map((h) => (
                  <th key={h} className={`py-1.5 pr-2 font-semibold ${h === "Karyawan" ? "" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recap.map((r) => (
                <tr key={r.employeeId} className="border-b border-black/20">
                  <td className="py-1.5 pr-2">{r.name}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.count}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.pending}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatRupiah(r.requested)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatRupiah(r.approved)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr>
                <td className="pt-3 pr-2 font-bold">Total ({recap.length} karyawan)</td>
                <td className="pt-3 pr-2 text-right font-bold tabular-nums">{recap.reduce((n, r) => n + r.count, 0)}</td>
                <td className="pt-3 pr-2 text-right font-bold tabular-nums">{recap.reduce((n, r) => n + r.pending, 0)}</td>
                <td className="pt-3 pr-2 text-right font-bold tabular-nums">{formatRupiah(recap.reduce((n, r) => n + r.requested, 0))}</td>
                <td className="pt-3 text-right font-bold tabular-nums">{formatRupiah(recap.reduce((n, r) => n + r.approved, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}
      {sections.map(({ group, data }, index) => {
        const { employee, summary } = data;
        const rows = data.rows.filter((r) => group.claimIds.has(r.id));
        const approvedSelected = rows.filter((r) => r.status === "APPROVED").reduce((n, r) => n + (r.approvedAmount ?? r.amount), 0);
        return (
          <section key={`${group.employeeId}-${group.year}`} className={index > 0 ? "mt-10 break-before-page" : undefined}>
            <header className="mb-5 border-b-2 border-black pb-3">
              <p className="text-xs font-bold tracking-widest">PT ARTHA MITRA INTERDATA</p>
              <h1 className="text-2xl font-bold">Rekap Klaim Kesehatan — {month ? monthLabel(month) : group.year}</h1>
              <p className="mt-1 text-sm">
                {employee.fullName}
                {employee.employeeNo && ` (${employee.employeeNo})`} · {employee.position} · {divisions[employee.division] ?? employee.division}
              </p>
            </header>

            {month && <p className="-mt-3 mb-3 text-xs">Plafon & sisa di bawah: posisi tahun {group.year} (semua klaim tahun itu).</p>}
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
                  <td colSpan={7} className="pt-3 pr-2 text-right font-bold">
                    Total disetujui ({month ? `klaim ${monthLabel(month)}` : "klaim di atas"})
                  </td>
                  <td className="pt-3 text-right font-bold tabular-nums">{formatRupiah(approvedSelected)}</td>
                </tr>
              </tfoot>
            </table>

            <footer className="mt-12 grid grid-cols-3 gap-8 text-center text-xs break-inside-avoid">
              {["Diajukan", "Diperiksa", "Disetujui"].map((label, i) => (
                <div key={label}>
                  <p>{label}</p>
                  <div className="mt-14 border-t border-black pt-1">{i === 0 ? employee.fullName : " "}</div>
                </div>
              ))}
            </footer>
          </section>
        );
      })}
    </>
  );
}
