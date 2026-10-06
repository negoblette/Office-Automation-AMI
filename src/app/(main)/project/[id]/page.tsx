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
import { PAYMENT_METHOD_LABEL, PROJECT_TYPE_LABEL, projectLabel } from "@/lib/labels";
import { getProjectDetail, type ProjectCostRow } from "@/lib/services/project-queries";
import { ExpenseDialog } from "../project-dialogs";

export const metadata: Metadata = { title: "Detail Project" };

const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

function Status({ status, level }: { status: ProjectCostRow["status"]; level: number | null }) {
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

function CostTable({ rows, showPerson }: { rows: ProjectCostRow[]; showPerson: boolean }) {
  if (!rows.length) return <EmptyState title="Belum ada biaya untuk project ini" className="py-8" />;
  return (
    <div className="overflow-x-auto rounded-2xl bg-card shadow-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-3">Nomor & Tanggal</th>
            {showPerson && <th className="px-4 py-3">Diajukan oleh</th>}
            <th className="px-4 py-3">Keterangan</th>
            <th className="px-4 py-3">Pembayaran</th>
            <th className="px-4 py-3 text-right">Nominal</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.source}-${row.id}`} className="border-t border-border">
              <td className="px-4 py-3">
                {row.href ? (
                  <Link href={row.href} className="font-medium whitespace-nowrap hover:underline">
                    {row.number}
                  </Link>
                ) : (
                  <p className="font-medium whitespace-nowrap">{row.number}</p>
                )}
                <p className="text-xs text-muted-foreground">{date(row.date)}</p>
              </td>
              {showPerson && <td className="px-4 py-3 whitespace-nowrap">{row.person ?? "—"}</td>}
              <td className="px-4 py-3">{row.description}</td>
              <td className="px-4 py-3">{row.paymentMethod ? PAYMENT_METHOD_LABEL[row.paymentMethod] : "—"}</td>
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
  const { totals } = project;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={projectLabel(project)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {project.customerName} · {PROJECT_TYPE_LABEL[project.type]}
            <StatusBadge variant={project.isActive ? "success" : "neutral"}>{project.isActive ? "Aktif" : "Nonaktif"}</StatusBadge>
          </span>
        }
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Project", href: "/project" }, { label: project.name }]}
        actions={
          isAdmin &&
          project.isActive && <ExpenseDialog projectId={project.id} />
        }
      />

      {/* Total biaya project terlihat semua karyawan (2026-10-06); daftar rinci expense Admin tetap khusus Admin. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Total biaya project"
          value={formatRupiah(totals.expense)}
          tone="danger"
          footer={`Disetujui · Reimburse ${formatRupiah(totals.reimburse)} + Expense Admin ${formatRupiah(totals.directExpense)}`}
        />
        <StatCard
          label="Menunggu approval"
          value={formatRupiah(totals.pendingReimburse + totals.pendingExpense)}
          tone="warning"
          footer="Belum masuk total biaya"
        />
      </div>

      <Section title={isAdmin ? "Biaya Project" : "Reimburse Saya di Project Ini"}>
        {isAdmin && (
          <p className="-mt-1 text-sm text-muted-foreground">
            Semua biaya project dalam satu daftar — reimburse karyawan (nomor <b>RMB</b>) dan expense yang dicatat Admin (nomor <b>EXP</b>). Hanya yang{" "}
            <b>disetujui</b> masuk total.
          </p>
        )}
        <CostTable rows={project.costs} showPerson={isAdmin} />
      </Section>
    </div>
  );
}
