import type { Metadata } from "next";
import { PrintToolbar } from "@/components/print/print-button";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { parseExportIds } from "@/lib/export-ids";
import { formatDate, formatRupiah } from "@/lib/format";
import { divisionLabels } from "@/lib/services/division";
import { getHealthPrintData, healthExportGroups } from "@/lib/services/health-queries";

export const metadata: Metadata = { title: "Rekap Klaim Kesehatan" };

const STATUS_LABEL = { PENDING: "Menunggu", APPROVED: "Disetujui", REJECTED: "Ditolak", DRAFT: "Draft" } as const;

/**
 * Ekspor PDF klaim kesehatan yang dipilih (2026-11-09: `?ids=`, dari panel "Pilih & Ekspor" atau tombol per klaim). Satu
 * bagian per karyawan per tahun: ringkasan plafon tahun itu (semua klaim) + klaim yang dipilih; dialog cetak langsung
 * terbuka untuk disimpan sebagai PDF. Selain Admin hanya miliknya sendiri (dicek di query).
 */
export default async function CetakKesehatanPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const user = await requireUser();
  const { ids } = await searchParams;
  const groups = await healthExportGroups(prisma, user, parseExportIds(ids));

  if (groups.length === 0) {
    return (
      <>
        <PrintToolbar backHref="/kesehatan" />
        <p className="text-sm">Tidak ada klaim untuk diekspor. Pilih klaim dari halaman Kesehatan (tombol &ldquo;Pilih & Ekspor&rdquo;).</p>
      </>
    );
  }

  const [divisions, sections] = await Promise.all([
    divisionLabels(prisma),
    Promise.all(groups.map(async (group) => ({ group, data: (await getHealthPrintData(prisma, group.employeeId, group.year))! }))),
  ]);

  return (
    <>
      <PrintToolbar backHref="/kesehatan" autoPrint />
      {sections.map(({ group, data }, index) => {
        const { employee, summary } = data;
        const rows = data.rows.filter((r) => group.claimIds.has(r.id));
        const approvedSelected = rows.filter((r) => r.status === "APPROVED").reduce((n, r) => n + (r.approvedAmount ?? r.amount), 0);
        return (
          <section key={`${group.employeeId}-${group.year}`} className={index > 0 ? "mt-10 break-before-page" : undefined}>
            <header className="mb-5 border-b-2 border-black pb-3">
              <p className="text-xs font-bold tracking-widest">PT ARTHA MITRA INTERDATA</p>
              <h1 className="text-2xl font-bold">Rekap Klaim Kesehatan — {group.year}</h1>
              <p className="mt-1 text-sm">
                {employee.fullName}
                {employee.employeeNo && ` (${employee.employeeNo})`} · {employee.position} · {divisions[employee.division] ?? employee.division}
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
                  <td colSpan={7} className="pt-3 pr-2 text-right font-bold">Total disetujui (klaim di atas)</td>
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
