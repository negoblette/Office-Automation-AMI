import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ApprovalStepper } from "@/components/shared/approval-stepper";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { FileChip } from "@/components/shared/file-chip";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime, formatRupiah } from "@/lib/format";
import { DIVISION_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { getReimbursementDetail } from "@/lib/services/reimbursement-queries";
import { DraftActions } from "./draft-actions";

export const metadata: Metadata = { title: "Detail Reimburse" };

export default async function DetailReimbursePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const r = await getReimbursementDetail(prisma, id);
  if (!r) notFound();

  const isOwner = r.employeeId === user.employeeId;
  // Staf hanya boleh melihat miliknya; draft hanya terlihat oleh pemohon.
  if (!isOwner && (user.role !== "ADMIN" || r.status === "DRAFT")) redirect("/akses-ditolak");

  const badge = requestStatusBadge(r.status, r.currentLevel);
  const title = r.number ?? "Draft Reimburse";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        breadcrumbs={[{ label: "Pengajuan & Keuangan" }, { label: "Reimburse", href: "/reimburse" }, { label: title }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {r.employeeName} · {r.employeePosition} · {DIVISION_LABEL[r.division]}
            <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
          </span>
        }
        actions={isOwner && r.status === "DRAFT" ? <DraftActions reimbursementId={r.id} /> : undefined}
      />

      <section className="grid gap-4 rounded-2xl bg-card p-5 shadow-card sm:grid-cols-4">
        <Info label="Subtotal Cash" value={formatRupiah(r.totalCash)} />
        <Info label="Subtotal Kartu Kredit" value={formatRupiah(r.totalCc)} />
        <Info label="Total" value={<span className="text-lg font-bold">{formatRupiah(r.total)}</span>} />
        <Info
          label={r.approvedAt ? "Disetujui" : r.submittedAt ? "Diajukan" : "Dibuat"}
          value={formatDateTime(r.approvedAt ?? r.submittedAt ?? r.createdAt)}
        />
      </section>

      {r.status !== "DRAFT" && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <h2 className="mb-4 text-base font-semibold">Riwayat Approval</h2>
          <ApprovalStepper steps={r.steps} requestStatus={r.status} />
        </section>
      )}

      <section className="overflow-x-auto rounded-2xl bg-card shadow-card">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <tr>
              {["Tanggal", "Company", "Names – Position", "Activities", "Lokasi", "Tipe", "Kwitansi", "Payment", "Total"].map((h) => (
                <th key={h} className={h === "Total" ? "px-4 py-3 text-right" : "px-4 py-3"}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.items.map((item) => (
              <tr key={item.id} className="border-t border-border align-top">
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(`${item.date}T00:00:00Z`, "short")}</td>
                <td className="px-4 py-3">
                  {item.customerName ?? "—"}
                  {item.projectName && <p className="text-xs text-muted-foreground">Project: {item.projectName}</p>}
                </td>
                <td className="px-4 py-3 whitespace-pre-line">{item.participants}</td>
                <td className="px-4 py-3">{item.activity}</td>
                <td className="px-4 py-3">{item.location}</td>
                <td className="px-4 py-3">{item.typeName}</td>
                <td className="px-4 py-3">
                  {item.receiptFileKey ? (
                    <FileChip fileKey={item.receiptFileKey} fileName={item.receiptFileName ?? "kwitansi"} className="max-w-40" />
                  ) : item.hasReceipt ? (
                    <span className="text-danger">Ya (belum di-upload)</span>
                  ) : (
                    "Tidak"
                  )}
                </td>
                <td className="px-4 py-3">{PAYMENT_METHOD_LABEL[item.paymentMethod]}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {r.note && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <h2 className="mb-1 text-sm font-semibold">Catatan</h2>
          <p className="text-sm whitespace-pre-line text-muted-foreground">{r.note}</p>
        </section>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{value}</p>
    </div>
  );
}
