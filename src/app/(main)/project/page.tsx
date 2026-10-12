import { Briefcase, ChevronRight, Plus, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { PROJECT_TYPE_LABEL, projectLabel } from "@/lib/labels";
import { listProjects, nextProjectCode, projectYears } from "@/lib/services/project-queries";
import { QuerySelect } from "@/components/shared/query-select";
import { canAddCustomerProject } from "@/lib/services/project";
import { toJakartaIsoDate } from "@/lib/format";
import { ExpenseShareChart } from "./expense-share-chart";
import { CustomerDialog, ProjectDialog } from "./project-dialogs";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ searchParams }: { searchParams: Promise<{ customer?: string; tahun?: string }> }) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const { customer, tahun } = await searchParams;
  // Cutoff per tahun kalender (2026-10-12): default tahun berjalan, tahun lalu = history.
  const currentYear = Number(toJakartaIsoDate().slice(0, 4));
  const years = await projectYears(prisma, currentYear);
  const year = years.includes(Number(tahun)) ? Number(tahun) : currentYear;
  const [allRows, customers, suggestedCode, canAdd] = await Promise.all([
    listProjects(prisma, user, year),
    prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    nextProjectCode(prisma),
    canAddCustomerProject(prisma, user),
  ]);
  // Filter per customer (?customer=<id>); id tidak dikenal = semua.
  const customerId = customers.some((c) => c.id === customer) ? customer : undefined;
  const rows = customerId ? allRows.filter((row) => row.customerId === customerId) : allRows;
  const sum = (key: "expense") => rows.reduce((total, row) => total + row.totals[key], 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Project"
        description={
          isAdmin
            ? `Total biaya per project tahun ${year} (reimburse karyawan + expense Admin yang disetujui).`
            : `Daftar project aktif & total biayanya tahun ${year}.${canAdd ? " Customer / project belum ada? Tambahkan di sini atau langsung dari form reimburse." : ""}`
        }
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Project" }]}
        actions={
          // 2026-10-12: tambah customer & project hanya divisi Sales + Admin; ubah/hapus tetap Admin (Kelola).
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <Link href="/project/customer" className={buttonVariants({ variant: "outline", size: "lg" })}>
                <Settings2 aria-hidden /> Kelola Customer & Project
              </Link>
            )}
            {canAdd && (
              <>
                <ProjectDialog
                  customers={customers.map((c) => ({ value: c.id, label: c.name }))}
                  customerId={customerId}
                  suggestedCode={suggestedCode}
                  canSetActive={isAdmin}
                  trigger={
                    <Button variant="outline" size="lg">
                      <Plus aria-hidden /> Tambah Project
                    </Button>
                  }
                />
                <CustomerDialog />
              </>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <QuerySelect label="Tahun" param="tahun" value={String(year)} options={years.map((y) => ({ value: String(y), label: y === currentYear ? `${y} (berjalan)` : `${y} (history)` }))} />
        {year !== currentYear && <p className="pb-2 text-sm font-medium text-warning">Menampilkan history tahun {year} (sudah cutoff 31 Desember {year}).</p>}
      </div>

      {/* Total biaya terlihat semua karyawan (2026-10-06). */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Project aktif" value={rows.filter((r) => r.isActive).length} unit="project" icon={Briefcase} />
        <StatCard label={`Total biaya project ${year}`} value={formatRupiah(sum("expense"))} tone="warning" footer="Reimburse karyawan + expense Admin (disetujui)" />
      </div>

      <ExpenseShareChart
        year={year}
        projects={allRows.map((row) => ({
          id: row.id,
          label: projectLabel(row),
          customerId: row.customerId,
          customerName: row.customerName,
          amount: row.totals.expense,
        }))}
      />

      <div className="flex flex-wrap items-end gap-3">
        <QuerySelect label="Filter customer" param="customer" value={customerId} emptyLabel="Semua customer" options={customers.map((c) => ({ value: c.id, label: c.name }))} />
        <p className="pb-2 text-sm text-muted-foreground">{rows.length} project</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={customerId ? "Customer ini belum punya project" : "Belum ada project"}
          description={canAdd ? "Tambahkan lewat tombol Tambah Project / Tambah Customer." : undefined}
        />
      ) : (
        <section className="overflow-x-auto rounded-2xl bg-card shadow-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Project & Customer</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total Biaya</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link href={`/project/${row.id}`} className="font-semibold hover:underline">
                      {projectLabel(row)}
                    </Link>
                    <p className="text-xs text-muted-foreground">{row.customerName}</p>
                  </td>
                  <td className="px-4 py-3">{PROJECT_TYPE_LABEL[row.type]}</td>
                  <td className="px-4 py-3">
                    <StatusBadge variant={row.isActive ? "success" : "neutral"}>{row.isActive ? "Aktif" : "Nonaktif"}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(row.totals.expense)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/project/${row.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Buka detail">
                      <ChevronRight />
                    </Link>
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
