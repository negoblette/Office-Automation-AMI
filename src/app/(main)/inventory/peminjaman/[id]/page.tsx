import { CircleAlert, CircleCheck, Clock, Info as InfoIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RowActions } from "@/app/(main)/approval/approval-tables";
import { ApprovalStepper } from "@/components/shared/approval-stepper";
import { PageHeader } from "@/components/shared/page-header";
import { TableScroll } from "@/components/shared/table-scroll";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { isEditableLoanStatus, LOAN_PURPOSE_LABEL, loanPurposeDescription, loanPurposeText } from "@/lib/demo-loan";
import { formatDate, formatDateTime } from "@/lib/format";
import { getApprovalForEntity } from "@/lib/services/approval-queries";
import { getDemoLoanDetail, getItemSenderOptions, type LoanDetail } from "@/lib/services/demo-loan-queries";
import { cn } from "@/lib/utils";
import { CancelLoanButton, DeliverDialog, EditLoanLink, ItemSenderDialog, PrintFormLink } from "../loan-actions";
import { LoanStatus } from "../loan-table";

export const metadata: Metadata = { title: "Detail Peminjaman Unit" };

const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

/**
 * Detail peminjaman (Fase 16.2). Semua user Inventaris boleh melihat. Aksi sesuai peran: approver (Ko Yosep) menyetujui /
 * menolak di sini atau di Approval Center; Operational memilih Item Sender setelah disetujui; pemohon mengubah /
 * membatalkan selama belum disetujui.
 */
export default async function DemoLoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, access } = await requireInventory("view");
  const { id } = await params;
  const loan = await getDemoLoanDetail(prisma, id);
  if (!loan) notFound();

  const isRequester = loan.requesterId === user.id;
  const canEdit = isRequester && isEditableLoanStatus(loan.status) && !loan.approval.partlyApproved;
  const canCancel = isRequester && isEditableLoanStatus(loan.status);
  const canPrepare = access.canManage && loan.status === "APPROVED";
  // Form bisa dicetak sejak disetujui (dan dicetak ulang setelah diantar).
  const canPrint = loan.status === "APPROVED" || loan.status === "ON_LOAN" || loan.status === "RETURNED";
  const [approval, senders] = await Promise.all([
    user.role !== "STAFF" ? getApprovalForEntity(prisma, "DEMO_LOAN", loan.id, user) : null,
    canPrepare ? getItemSenderOptions(prisma) : [],
  ]);
  const showApprovalActions = Boolean(approval && (approval.canApprove || approval.canRevoke));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={loan.borrowerName}
        breadcrumbs={[
          { label: "Operasional & Aset" },
          { label: "Inventaris / Unit Demo", href: "/inventory" },
          { label: "Peminjaman", href: "/inventory/peminjaman" },
          { label: loan.number },
        ]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{loan.number}</span>
            <span aria-hidden>·</span>
            {loanPurposeText(loan.purpose, loan.purposeDetail)}
            <span aria-hidden>·</span>
            {loan.itemCount} unit
            <LoanStatus status={loan.status} overdue={loan.overdue} />
          </span>
        }
        actions={
          (showApprovalActions || canPrepare || canPrint || canEdit || canCancel) && (
            <>
              {showApprovalActions && approval && <RowActions row={approval} />}
              {canPrepare && <ItemSenderDialog loanId={loan.id} senders={senders} current={loan.itemSenderId} />}
              {canPrint && <PrintFormLink loanId={loan.id} primary={canPrepare && Boolean(loan.itemSenderId)} />}
              {canPrepare && loan.itemSenderId && <DeliverDialog loanId={loan.id} submittedAt={loan.submittedAt} />}
              {canCancel && <CancelLoanButton loanId={loan.id} borrowerName={loan.borrowerName} />}
              {canEdit && <EditLoanLink loanId={loan.id} rejected={loan.status === "REJECTED"} />}
            </>
          )
        }
      />

      <StatusNote loan={loan} isRequester={isRequester} canManage={access.canManage} canApprove={Boolean(approval?.canApprove)} />

      <section className="grid gap-x-8 gap-y-4 rounded-2xl bg-card p-5 shadow-card sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Kegunaan" value={LOAN_PURPOSE_LABEL[loan.purpose]} sub={loanPurposeDescription(loan.purpose, loan.purposeDetail)} />
        <Info label="Lend To" value={loan.borrowerName} sub={loan.customerId ? "Data Customer" : "Perusahaan baru (diketik pemohon)"} />
        <Info
          label="PIC (up:)"
          value={loan.picName}
          sub={
            <a href={`mailto:${loan.picEmail}`} className="underline-offset-4 hover:underline">
              {loan.picEmail}
            </a>
          }
        />
        <Info label="Trial periode" value={`${date(loan.startDate)} – ${date(loan.dueDate)}`} sub={`${loan.durationLabel} · jatuh tempo ${date(loan.dueDate)}`} />
        <Info label="Sales Person" value={loan.salesPersonName} />
        <Info label="Prepared By (pemohon)" value={loan.requesterName} sub={`Diajukan ${formatDateTime(loan.submittedAt)}`} />
        <Info
          label="Item Sender"
          value={loan.itemSenderName ?? "—"}
          sub={loan.itemSenderName ? (loan.operationalName ? `Disiapkan ${loan.operationalName}` : undefined) : "Dipilih Operational setelah disetujui"}
          muted={!loan.itemSenderName}
        />
        {loan.deliveredAt && (
          <Info label="Diantar" value={date(loan.deliveredAt)} sub={loan.receivedByName ? `Diterima ${loan.receivedByName}` : "Nama penerima tidak dicatat"} />
        )}
        {loan.remarks && <Info label="Keperluan (Remarks)" value={loan.remarks} className="sm:col-span-2" />}
      </section>

      {loan.approval.steps.length > 0 && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <h2 className="mb-4 text-base font-semibold">Riwayat Approval</h2>
          <ApprovalStepper steps={loan.approval.steps} requestStatus={loan.approval.status ?? "PENDING"} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Unit ({loan.itemCount})</h2>
        <TableScroll as="div" label="Unit yang dipinjam" className="rounded-2xl bg-card shadow-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Part number / deskripsi</th>
                <th className="px-4 py-3">Serial number</th>
                <th className="px-4 py-3">Posisi rak</th>
              </tr>
            </thead>
            <tbody>
              {loan.items.map((item) => (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <Link href={`/inventory/${item.assetId}`} className="font-medium underline-offset-4 hover:underline">
                      {item.deviceName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{item.serialNo}</td>
                  <td className="px-4 py-3">
                    <span className={cn(!item.location && "text-muted-foreground")}>{item.location ?? "Tidak di rak"}</span>
                    {item.currentLocation !== item.location && (
                      <span className="block text-xs text-warning">Sekarang: {item.currentLocation ?? "tidak di rak"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>
    </div>
  );
}

function Info({
  label,
  value,
  sub,
  muted,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className={cn("mt-1 font-medium wrap-anywhere whitespace-pre-line", muted && "text-muted-foreground")}>{value}</p>
      {sub && <p className="text-xs wrap-anywhere text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Kalimat status di atas rincian: apa yang sedang terjadi dan siapa yang perlu bertindak. */
function StatusNote({ loan, isRequester, canManage, canApprove }: { loan: LoanDetail; isRequester: boolean; canManage: boolean; canApprove: boolean }) {
  const waitingFor = loan.approval.steps.find((step) => step.status === "PENDING")?.approvers.join(" / ");
  const approvedBy = loan.approval.steps.filter((step) => step.status === "APPROVED" && step.actedBy).at(-1)?.actedBy;
  let tone: "info" | "danger" | "success" | "neutral";
  let icon = InfoIcon;
  let body: React.ReactNode;
  switch (loan.status) {
    case "PENDING":
      tone = "info";
      icon = Clock;
      body = canApprove ? (
        <>
          <span className="font-semibold">Menunggu persetujuan Anda.</span> Periksa kegunaan, unit, dan lama pinjam, lalu Setujui atau Tolak dengan alasan.
        </>
      ) : (
        <>
          <span className="font-semibold">Menunggu approval{waitingFor ? ` ${waitingFor}` : ""}.</span>
          {isRequester &&
            (loan.approval.partlyApproved
              ? " Sudah disetujui sebagian, jadi tidak bisa diubah lagi; masih bisa dibatalkan."
              : " Selama belum disetujui, Anda masih bisa mengubah atau membatalkannya.")}
        </>
      );
      break;
    case "REJECTED":
      tone = "danger";
      icon = CircleAlert;
      body = (
        <>
          <span className="font-semibold">
            Ditolak oleh {loan.approval.rejection?.by ?? "approver"}
            {loan.approval.rejection && `, ${formatDateTime(loan.approval.rejection.at)}`}:
          </span>{" "}
          {loan.approval.rejection?.reason}
          {isRequester && <span className="block pt-1">Ubah pengajuan lalu ajukan ulang, atau batalkan bila tidak jadi.</span>}
        </>
      );
      break;
    case "APPROVED":
      tone = "success";
      icon = CircleCheck;
      body = (
        <>
          <span className="font-semibold">
            Disetujui{approvedBy ? ` oleh ${approvedBy}` : ""}
            {loan.approvedAt && `, ${formatDateTime(loan.approvedAt)}`}.
          </span>{" "}
          {canManage
            ? loan.itemSenderName
              ? `Item Sender: ${loan.itemSenderName}. Cetak form untuk ditandatangani, antar barang, lalu tekan Sudah Diantar.`
              : "Siapkan barang dari posisi rak yang tertera, lalu pilih Item Sender (pengantar barang) dan cetak form."
            : `Barang sedang disiapkan Operational${loan.itemSenderName ? ` dan diantar oleh ${loan.itemSenderName}` : ""}.`}
        </>
      );
      break;
    case "ON_LOAN":
      tone = loan.overdue ? "danger" : "info";
      icon = loan.overdue ? CircleAlert : Clock;
      body = (
        <>
          <span className="font-semibold">
            {loan.overdue ? "Lewat jatuh tempo" : "Sedang dipinjam"} — jatuh tempo {date(loan.dueDate)}.
          </span>{" "}
          Diantar {loan.deliveredAt ? date(loan.deliveredAt) : "—"}
          {loan.itemSenderName && ` oleh ${loan.itemSenderName}`}
          {loan.receivedByName && `, diterima ${loan.receivedByName}`}.
        </>
      );
      break;
    case "CANCELLED":
      tone = "neutral";
      body = <span className="font-semibold">Dibatalkan pemohon. Approval-nya dihentikan dan unitnya sudah bisa diajukan lagi.</span>;
      break;
    default:
      return null;
  }
  const Icon = icon;
  const classes = {
    info: "bg-info-soft text-ink",
    danger: "bg-red-soft text-red-deep",
    success: "bg-green-soft text-green-deep",
    neutral: "bg-panel text-ink-2",
  }[tone];
  return (
    <p role="status" className={cn("flex items-start gap-2.5 rounded-2xl px-5 py-4 text-sm", classes)}>
      <Icon className="mt-0.5 size-[18px] shrink-0" aria-hidden />
      <span className="min-w-0 wrap-anywhere">{body}</span>
    </p>
  );
}
