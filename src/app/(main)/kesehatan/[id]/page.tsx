import type { Metadata } from "next";
import { Fragment } from "react";
import { notFound, redirect } from "next/navigation";
import { RowActions } from "@/app/(main)/approval/approval-tables";
import { CorrectionList } from "@/app/(main)/approval/correction-ui";
import { ApprovalStepper } from "@/components/shared/approval-stepper";
import { ExportLinks } from "@/components/shared/export-selector";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableScroll } from "@/components/shared/table-scroll";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime, formatRupiah } from "@/lib/format";
import { getApprovalForEntity } from "@/lib/services/approval-queries";
import { divisionLabels } from "@/lib/services/division";
import { getHealthClaimDetail, getHealthSummary, listHealthCategories } from "@/lib/services/health-queries";
import { healthClaimDraftFormSchema } from "@/lib/validators/health";
import { type ExistingHealthClaim, HealthClaimDialog } from "../claim-form";
import { HealthDraftActions } from "./draft-actions";

export const metadata: Metadata = { title: "Detail Klaim Kesehatan" };

const monthLabel = (yearMonth: string) => formatDate(`${yearMonth}-01T00:00:00Z`, "short").replace(/^1 /, "");

/** Detail klaim kesehatan (2026-11-20): rincian baris, riwayat approval, jadwal bayar — seperti detail reimburse. */
export default async function DetailKlaimKesehatanPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const c = await getHealthClaimDetail(prisma, id);
  if (!c) notFound();

  const isOwner = c.employeeId === user.employeeId;
  // Approver (role APPROVER) boleh melihat klaim yang mencantumkan dirinya sebagai approver.
  const isAssignedApprover =
    !isOwner &&
    user.role === "APPROVER" &&
    (await prisma.approvalRequestStep.count({ where: { approverIds: { has: user.id }, request: { module: "HEALTH", entityId: c.id } } })) > 0;
  // Staf hanya boleh melihat miliknya; draft hanya terlihat oleh pemohon.
  if (!isOwner && ((user.role !== "ADMIN" && !isAssignedApprover) || c.status === "DRAFT")) redirect("/akses-ditolak");

  const badge = requestStatusBadge(c.status, c.currentLevel);
  const title = c.number ?? "Draft Klaim Kesehatan";
  const incomplete = c.draftForm !== null;
  // Aksi approver langsung di halaman ini: Setujui (isi nominal disetujui), Tolak, Koreksi, Batalkan.
  const approval = user.role !== "STAFF" ? await getApprovalForEntity(prisma, "HEALTH", c.id, user) : null;
  // Draft (2026-11-23) / klaim ditolak milik sendiri: Ubah / Revisi lewat dialog yang sama dengan Ajukan Klaim (butuh plafon
  // tahun berjalan, sama dengan tombol di daftar klaim).
  const editable = isOwner && (c.status === "DRAFT" || c.status === "REJECTED") ? c.status : null;
  const dialogContext =
    editable && user.employeeId
      ? await Promise.all([getHealthSummary(prisma, user.employeeId), listHealthCategories(prisma)]).then(([summary, categories]) =>
          summary.annual != null ? { categories, remaining: summary.remaining } : null,
        )
      : null;
  // Draft belum lengkap dilanjutkan dari isian yang tersimpan; selain itu dari baris klaim.
  const draftForm = incomplete ? healthClaimDraftFormSchema.safeParse(c.draftForm).data : undefined;
  const existing: ExistingHealthClaim | null = editable
    ? {
        id: c.id,
        number: c.number,
        status: editable,
        incomplete,
        items: draftForm
          ? draftForm.items.map((item) => ({ categoryId: item.categoryId, date: item.date, amount: item.amount, note: item.note }))
          : c.items.map((item) => ({ categoryId: item.categoryId, date: item.date, amount: item.amount, note: item.note })),
        note: draftForm ? draftForm.note : c.note,
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        breadcrumbs={[{ label: "Pengajuan & Keuangan" }, { label: "Kesehatan & Plafon", href: "/kesehatan" }, { label: title }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {c.employeeName} · {c.employeePosition} · {(await divisionLabels(prisma))[c.division] ?? c.division}
            <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
          </span>
        }
        actions={
          <div className="flex flex-col items-end gap-2">
            {existing ? (
              <HealthDraftActions
                claimId={c.id}
                rejected={existing.status === "REJECTED"}
                incomplete={incomplete}
                edit={dialogContext && <HealthClaimDialog {...dialogContext} claim={existing} size="lg" />}
              />
            ) : (
              approval && <RowActions row={approval} />
            )}
            {(c.status === "PENDING" || c.status === "APPROVED") && (isOwner || user.role === "ADMIN") && (
              <ExportLinks ids={[c.id]} pdfPath="/cetak/kesehatan" excelPath="/api/export/kesehatan" />
            )}
          </div>
        }
      />

      <section className="grid gap-4 rounded-2xl bg-card p-5 shadow-card sm:grid-cols-4">
        <Info label={c.status === "DRAFT" ? "Total" : "Nominal Diajukan"} value={formatRupiah(c.amount)} />
        <Info
          label="Nominal Disetujui"
          value={c.approvedAmount === null ? <span className="text-muted-foreground">—</span> : <span className="text-lg font-bold">{formatRupiah(c.approvedAmount)}</span>}
        />
        <Info label="Tahun Plafon" value={c.claimDate?.slice(0, 4) ?? <span className="text-muted-foreground">—</span>} />
        <Info
          label={c.approvedAt ? "Disetujui" : c.submittedAt ? "Diajukan" : "Dibuat"}
          value={formatDateTime(c.approvedAt ?? c.submittedAt ?? c.createdAt)}
        />
      </section>

      {c.status !== "DRAFT" && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <h2 className="mb-4 text-base font-semibold">Riwayat Approval</h2>
          <ApprovalStepper steps={c.steps} requestStatus={c.status} />
          {c.corrections.length > 0 && (
            <div className="mt-4 rounded-xl bg-warning-soft p-3">
              <p className="mb-1 text-sm font-semibold">Koreksi oleh approver</p>
              <CorrectionList corrections={c.corrections} className="flex flex-col gap-1 text-sm text-muted-foreground" />
            </div>
          )}
        </section>
      )}

      {incomplete && (
        <p role="status" className="rounded-2xl bg-warning-soft px-5 py-4 text-sm">
          <span className="font-semibold">Draft belum lengkap.</span> Isian Anda tersimpan. Tekan Lanjutkan Mengisi untuk meneruskannya; draft bisa diajukan setelah semua isian lengkap.
        </p>
      )}

      {/* Draft belum lengkap belum punya baris (isiannya ada di dialog Lanjutkan Mengisi). */}
      {c.items.length > 0 && (
        <TableScroll as="section" label="Rincian klaim kesehatan" className="rounded-2xl bg-card shadow-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <tr>
                {["Tanggal", "Kategori", "Keterangan", "Nominal"].map((h) => (
                  <th key={h} className={h === "Nominal" ? "px-4 py-3 text-right" : "px-4 py-3"}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Dikelompokkan per tanggal + subtotal harian, sama dengan detail reimburse. */}
              {groupByDate(c.items).map(([day, items]) => (
                <Fragment key={day}>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-border align-top">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(`${item.date}T00:00:00Z`, "short")}</td>
                      <td className="px-4 py-3">{item.categoryName}</td>
                      <td className="px-4 py-3 whitespace-pre-line text-muted-foreground">{item.note || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(item.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-muted/40 text-sm">
                    <td colSpan={3} className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Subtotal {formatDate(`${day}T00:00:00Z`, "short")}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatRupiah(items.reduce((sum, i) => sum + i.amount, 0))}</td>
                  </tr>
                </Fragment>
              ))}
              <tr className="border-t-2 border-border">
                <td colSpan={3} className="px-4 py-2 text-right font-medium text-muted-foreground">
                  {c.status === "DRAFT" ? "Total" : "Total diajukan"}
                </td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatRupiah(c.amount)}</td>
              </tr>
            </tbody>
          </table>
        </TableScroll>
      )}

      {c.payouts.length > 0 && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <h2 className="mb-3 text-base font-semibold">Jadwal Pembayaran</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {c.payouts.map((p) => (
              <li key={p.month} className="flex items-center justify-between gap-4">
                <span>{monthLabel(p.month)}</span>
                <span className={p.paid ? "font-medium text-success tabular-nums" : "tabular-nums"}>
                  {formatRupiah(p.amount)} {p.paid ? "· Dibayar ✓" : "· Belum dibayar"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.note && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <h2 className="mb-1 text-sm font-semibold">Catatan</h2>
          <p className="text-sm whitespace-pre-line text-muted-foreground">{c.note}</p>
        </section>
      )}
    </div>
  );
}

function groupByDate<T extends { date: string }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => a.date.localeCompare(b.date))) groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
  return [...groups.entries()];
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{value}</p>
    </div>
  );
}
