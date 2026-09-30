import { Briefcase, ChevronRight, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";
import { listProjects } from "@/lib/services/project-queries";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const rows = await listProjects(prisma, user);
  const sum = (key: "expense" | "revenue") => rows.reduce((total, row) => total + (row.totals?.[key] ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Project"
        description={
          isAdmin
            ? "Expense (termasuk reimburse yang disetujui) dan revenue per project customer."
            : "Daftar project aktif. Pilih project di baris reimburse agar biayanya tercatat di project tersebut."
        }
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Project" }]}
        actions={
          isAdmin && (
            <Link href="/project/customer" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Settings2 aria-hidden /> Kelola Customer & Project
            </Link>
          )
        }
      />

      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Project aktif" value={rows.filter((r) => r.isActive).length} unit="project" icon={Briefcase} />
          <StatCard label="Total expense" value={formatRupiah(sum("expense"))} tone="warning" footer="Reimburse + expense langsung (disetujui)" />
          <StatCard label="Total revenue" value={formatRupiah(sum("revenue"))} tone="success" footer="Revenue disetujui" />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={Briefcase} title="Belum ada project" description={isAdmin ? "Tambahkan customer & project di menu Kelola." : undefined} />
      ) : (
        <section className="overflow-x-auto rounded-2xl bg-card shadow-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Project & Customer</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Status</th>
                {isAdmin && (
                  <>
                    <th className="px-4 py-3 text-right">Expense</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">Selisih</th>
                  </>
                )}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link href={`/project/${row.id}`} className="font-semibold hover:underline">
                      {row.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{row.customerName}</p>
                  </td>
                  <td className="px-4 py-3">{PROJECT_TYPE_LABEL[row.type]}</td>
                  <td className="px-4 py-3">
                    <StatusBadge variant={row.isActive ? "success" : "neutral"}>{row.isActive ? "Aktif" : "Nonaktif"}</StatusBadge>
                  </td>
                  {isAdmin && row.totals && (
                    <>
                      <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(row.totals.expense)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(row.totals.revenue)}</td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${row.totals.margin < 0 ? "text-danger" : ""}`}>
                        {formatRupiah(row.totals.margin)}
                      </td>
                    </>
                  )}
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
