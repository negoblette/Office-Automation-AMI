import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { PersonCell } from "@/components/shared/person-cell";
import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { toJakartaIsoDate } from "@/lib/format";
import { listPlafonds } from "@/lib/services/health-queries";
import { PlafondInput } from "./plafond-row";

export const metadata: Metadata = { title: "Plafon Kesehatan" };

export default async function SettingKesehatanPage({ searchParams }: { searchParams: Promise<{ tahun?: string }> }) {
  await requireAdmin();
  const currentYear = Number(toJakartaIsoDate().slice(0, 4));
  const requested = Number((await searchParams).tahun);
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : currentYear;
  const rows = await listPlafonds(prisma, year);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Plafon Kesehatan ${year}`}
        description="Plafon tahunan per karyawan (HC-01). Plafon bulanan = tahunan ÷ 12 dibulatkan ke bawah per Rp 10.000; sisanya masuk Desember."
        breadcrumbs={[{ label: "Kontrol & Sistem" }, { label: "Setting", href: "/setting" }, { label: "Plafon Kesehatan" }]}
        actions={
          <nav aria-label="Pilih tahun" className="flex gap-1">
            {[year - 1, year + 1].map((y) => (
              <Link key={y} href={`/setting/kesehatan?tahun=${y}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {y}
              </Link>
            ))}
          </nav>
        }
      />
      <section className="overflow-x-auto rounded-2xl bg-card shadow-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Karyawan</th>
              <th className="px-4 py-3">Plafon tahunan {year}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employeeId} className="border-t border-border align-top">
                <td className="px-4 py-3">
                  <PersonCell name={row.employeeName} subtitle={row.employeePosition} />
                </td>
                <td className="px-4 py-3">
                  <PlafondInput employeeId={row.employeeId} year={year} annual={row.annual} used={row.used} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
