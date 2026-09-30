import { Banknote, CheckCheck, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PersonCell } from "@/components/shared/person-cell";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime, formatRupiah, toJakartaIsoDate } from "@/lib/format";
import { nextMonth } from "@/lib/health";
import { listPayoutsForMonth } from "@/lib/services/health-queries";
import { KesehatanTabs } from "../health-ui";
import { PaidToggle } from "./paid-toggle";

export const metadata: Metadata = { title: "Jadwal Pembayaran Kesehatan" };

function previousMonth(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export default async function PembayaranPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  await requireAdmin();
  const requested = (await searchParams).bulan;
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : toJakartaIsoDate().slice(0, 7);
  const rows = await listPayoutsForMonth(prisma, month);
  const label = formatDate(`${month}-01T00:00:00Z`).replace(/^1 /, "");
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const paid = rows.filter((r) => r.paidAt).reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Jadwal Pembayaran Kesehatan"
        description="Pembayaran klaim per bulan untuk Finance. Klaim di atas plafon bulanan otomatis dibagi ke bulan berikutnya."
        breadcrumbs={[{ label: "Pengajuan & Keuangan" }, { label: "Kesehatan & Plafon", href: "/kesehatan" }, { label: "Jadwal Pembayaran" }]}
        actions={
          <nav aria-label="Pilih bulan" className="flex items-center gap-2">
            <Link href={`/kesehatan/pembayaran?bulan=${previousMonth(month)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              ‹ Sebelumnya
            </Link>
            <span className="min-w-32 text-center text-sm font-semibold">{label}</span>
            <Link href={`/kesehatan/pembayaran?bulan=${nextMonth(month)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Berikutnya ›
            </Link>
          </nav>
        }
      />
      <KesehatanTabs active="pembayaran" isAdmin />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={`Total ${label}`} value={formatRupiah(total)} icon={Banknote} footer={`${rows.length} pembayaran`} />
        <StatCard label="Sudah dibayar" value={formatRupiah(paid)} icon={CheckCheck} tone="success" />
        <StatCard label="Belum dibayar" value={formatRupiah(total - paid)} icon={Clock} tone="warning" />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Banknote} title={`Tidak ada pembayaran di ${label}`} />
      ) : (
        <section className="overflow-x-auto rounded-2xl bg-card shadow-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Karyawan</th>
                <th className="px-4 py-3">Klaim</th>
                <th className="px-4 py-3 text-right">Nilai klaim</th>
                <th className="px-4 py-3 text-right">Dibayar bulan ini</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <PersonCell name={row.employeeName} subtitle={row.employeePosition} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.claimNumber}</p>
                    <p className="text-xs text-muted-foreground">{row.categoryName}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(row.claimAmount)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatRupiah(row.amount)}</td>
                  <td className="px-4 py-3">
                    {row.paidAt ? (
                      <span title={formatDateTime(row.paidAt)}>
                        <StatusBadge variant="success">Dibayar</StatusBadge>
                      </span>
                    ) : (
                      <StatusBadge variant="warning">Belum dibayar</StatusBadge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PaidToggle payoutId={row.id} paid={row.paidAt !== null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
