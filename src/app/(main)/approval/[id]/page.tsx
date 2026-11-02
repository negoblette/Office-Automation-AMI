import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalStepper } from "@/components/shared/approval-stepper";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { FileChip } from "@/components/shared/file-chip";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { APPROVAL_MODULE_META } from "@/lib/approval-modules";
import { requireApprover } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getApprovalDetail } from "@/lib/services/approval-queries";
import { RowActions } from "../approval-tables";
import { CorrectionList } from "../correction-ui";

export const metadata: Metadata = { title: "Detail Approval" };

/** Detail satu pengajuan (2026-11-02): rincian lengkap, file, alur, koreksi, dan aksi approver — tabel cukup ringkas. */
export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireApprover();
  const { id } = await params;
  const row = await getApprovalDetail(prisma, id, viewer);
  if (!row) notFound();

  const meta = APPROVAL_MODULE_META[row.module];
  const badge = requestStatusBadge(row.status, row.currentLevel);
  // Halaman modul yang punya detail sendiri (reimburse, overtime, cuti, …); sertifikat & appeal cukup di sini.
  const modulePath = row.module === "CERTIFICATE" || row.module === "ATTENDANCE_APPEAL" ? null : meta.path(row.entityId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${meta.label} ${row.entityNumber}`}
        description={`Diajukan ${row.requesterName}${row.requesterPosition ? ` (${row.requesterPosition})` : ""} · ${formatDateTime(row.createdAt)}`}
        breadcrumbs={[{ label: "Kontrol & Sistem" }, { label: "Approval", href: "/approval" }, { label: row.entityNumber }]}
        actions={<RowActions row={row} />}
      />

      <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant="info" dot={false}>
            {meta.label}
          </StatusBadge>
          <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
          {row.completedAt && <span className="text-sm text-muted-foreground">Selesai {formatDateTime(row.completedAt)}</span>}
        </div>
        <dl className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Rincian</dt>
          <dd className="text-sm whitespace-pre-line">{row.summary ?? "—"}</dd>
          {row.file && (
            <>
              <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">File</dt>
              <dd>
                <FileChip fileKey={row.file.key} fileName={row.file.name} className="max-w-full" />
              </dd>
            </>
          )}
          {modulePath && (
            <>
              <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Halaman modul</dt>
              <dd>
                <Link href={modulePath} className="text-sm font-semibold text-primary hover:underline">
                  Buka {meta.label.toLowerCase()} →
                </Link>
              </dd>
            </>
          )}
        </dl>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card sm:p-6">
        <h2 className="text-base font-semibold">Alur Approval</h2>
        <ApprovalStepper steps={row.steps} requestStatus={row.status} />
        {row.corrections.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Koreksi & pembatalan</h3>
            <CorrectionList corrections={row.corrections} className="flex flex-col gap-1 text-sm text-muted-foreground" />
          </div>
        )}
      </section>
    </div>
  );
}
