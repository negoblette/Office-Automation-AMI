import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDate, formatRupiah } from "@/lib/format";
import { PAYMENT_METHOD_LABEL, PROJECT_TYPE_LABEL } from "@/lib/labels";
import { getProjectDetail, type ProjectEntryRow } from "@/lib/services/project-queries";
import { ExpenseDialog, RevenueDialog } from "../project-dialogs";

export const metadata: Metadata = { title: "Detail Project" };

const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

function Status({ status, level }: { status: ProjectEntryRow["status"]; level: number | null }) {
  const badge = requestStatusBadge(status, level);
  return <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>;
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function EntryTable({ rows, withPayment }: { rows: ProjectEntryRow[]; withPayment: boolean }) {
  if (!rows.length) return <EmptyState title="Belum ada data" className="py-8" />;
  return (
    <div className="overflow-x-auto rounded-2xl bg-card shadow-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-3">Nomor & Tanggal</th>
            <th className="px-4 py-3">Keterangan</th>
            {withPayment && <th className="px-4 py-3">Pembayaran</th>}
            <th className="px-4 py-3 text-right">Nominal</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border">
              <td className="px-4 py-3">
                <p className="font-medium whitespace-nowrap">{row.number}</p>
                <p className="text-xs text-muted-foreground">{date(row.date)}</p>
              </td>
              <td className="px-4 py-3">{row.description}</td>
              {withPayment && <td className="px-4 py-3">{row.paymentMethod ? PAYMENT_METHOD_LABEL[row.paymentMethod] : "—"}</td>}
              <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(row.amount)}</td>
              <td className="px-4 py-3">
                <Status status={row.status} level={row.currentLevel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const { id } = await params;
  const project = await getProjectDetail(prisma, id, user);
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={project.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {project.customerName} · {PROJECT_TYPE_LABEL[project.type]}
            <StatusBadge variant={project.isActive ? "success" : "neutral"}>{project.isActive ? "Aktif" : "Nonaktif"}</StatusBadge>
          </span>
        }
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Project", href: "/project" }, { label: project.name }]}
        actions={
          isAdmin &&
          project.isActive && (
            <>
              <RevenueDialog projectId={project.id} />
              <ExpenseDialog projectId={project.id} />
            </>
          )
        }
      />

      {project.totals && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Reimburse (disetujui)" value={formatRupiah(project.totals.reimburse)} tone="info" footer="Baris reimburse yang memilih project ini" />
          <StatCard label="Expense langsung" value={formatRupiah(project.totals.directExpense)} tone="warning" footer={`Menunggu: ${formatRupiah(project.totals.pendingExpense)}`} />
          <StatCard label="Revenue" value={formatRupiah(project.totals.revenue)} tone="success" footer={`Menunggu: ${formatRupiah(project.totals.pendingRevenue)}`} />
          <StatCard
            label="Selisih"
            value={formatRupiah(project.totals.margin)}
            tone={project.totals.margin < 0 ? "danger" : "success"}
            footer={`Total expense ${formatRupiah(project.totals.expense)}`}
          />
        </div>
      )}

      {isAdmin && (
        <>
          <Section title="Expense Langsung">
            <EntryTable rows={project.expenses} withPayment />
          </Section>
          <Section title="Revenue">
            <EntryTable rows={project.revenues} withPayment={false} />
          </Section>
        </>
      )}

      <Section title={isAdmin ? "Reimburse ke Project Ini" : "Reimburse Saya di Project Ini"}>
        {project.reimburse.length === 0 ? (
          <EmptyState title="Belum ada baris reimburse" className="py-8" />
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-card shadow-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3">Nomor</th>
                  <th className="px-4 py-3">Karyawan</th>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Aktivitas</th>
                  <th className="px-4 py-3 text-right">Nominal</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {project.reimburse.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <Link href={`/reimburse/${row.reimbursementId}`} className="font-medium whitespace-nowrap hover:underline">
                        {row.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.employeeName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{date(row.date)}</td>
                    <td className="px-4 py-3">{row.activity}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(row.amount)}</td>
                    <td className="px-4 py-3">
                      <Status status={row.status} level={null} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
