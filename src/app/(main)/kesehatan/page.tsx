import { Printer } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { toJakartaIsoDate } from "@/lib/format";
import { getHealthSummary, listHealthCategories, listHealthClaims } from "@/lib/services/health-queries";
import { HealthClaimDialog } from "./claim-form";
import { HealthClaimTable } from "./claim-table";
import { HealthSummaryCard, KesehatanTabs } from "./health-ui";

export const metadata: Metadata = { title: "Kesehatan" };

export default async function KesehatanPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const [summary, rows, categories, employees] = await Promise.all([
    user.employeeId ? getHealthSummary(prisma, user.employeeId) : null,
    listHealthClaims(prisma, user),
    listHealthCategories(prisma),
    isAdmin ? prisma.employee.findMany({ where: { status: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }) : [],
  ]);
  const thisYear = Number(toJakartaIsoDate().slice(0, 4));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kesehatan & Plafon"
        description={isAdmin ? "Klaim kesehatan Anda dan seluruh karyawan." : "Ajukan klaim rawat jalan, obat-obatan, vitamin, atau kacamata."}
        breadcrumbs={[{ label: "Pengajuan & Keuangan" }, { label: "Kesehatan & Plafon" }]}
        actions={summary?.annual != null && <HealthClaimDialog categories={categories} remaining={summary.remaining} />}
      />
      <KesehatanTabs active="klaim" isAdmin={isAdmin} />
      {summary && <HealthSummaryCard summary={summary} />}

      {/* Rekap klaim per orang per tahun untuk dicetak / disimpan PDF (2026-10-16). Form GET biasa. */}
      <form action="/cetak/kesehatan" method="get" className="flex flex-wrap items-end gap-3 rounded-2xl bg-card p-4 shadow-card">
        <label className="flex flex-col gap-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Tahun
          <input
            type="number"
            name="tahun"
            defaultValue={thisYear}
            min={2020}
            max={thisYear}
            className="h-10 w-28 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
        {isAdmin && (
          <label className="flex flex-col gap-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Karyawan
            <select name="karyawan" defaultValue={user.employeeId ?? ""} className="h-10 min-w-56 rounded-lg border border-input bg-background px-3 text-sm text-foreground">
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className={buttonVariants({ variant: "outline", size: "lg" })}>
          <Printer aria-hidden /> Cetak / Simpan PDF
        </button>
      </form>
      <HealthClaimTable rows={rows} showRequester={isAdmin} revise={summary?.annual != null ? { categories, remaining: summary.remaining } : undefined} />
    </div>
  );
}
