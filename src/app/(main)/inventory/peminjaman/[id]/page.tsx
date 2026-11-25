import { CircleAlert, CircleCheck, Clock, Info as InfoIcon, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RowActions } from "@/app/(main)/approval/approval-tables";
import { ApprovalStepper } from "@/components/shared/approval-stepper";
import { PageHeader } from "@/components/shared/page-header";
import { TableScroll } from "@/components/shared/table-scroll";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  AMI_OWNER,
  DUE_SOON_DAYS,
  dueLabel,
  EXTENSION_STATUS_LABEL,
  EXTENSION_STATUS_VARIANT,
  finalCondition,
  isEditableLoanStatus,
  isProblemCondition,
  LOAN_PURPOSE_LABEL,
  loanPurposeDescription,
  loanPurposeText,
  maxLoanEnd,
  RETURN_CONDITION_LABEL,
  RETURN_CONDITION_VARIANT,
} from "@/lib/demo-loan";
import { formatDate, formatDateTime } from "@/lib/format";
import { getApprovalForEntity } from "@/lib/services/approval-queries";
import { getDemoLoanDetail, getItemSenderOptions, type LoanDetail, type LoanExtensionView } from "@/lib/services/demo-loan-queries";
import { cn } from "@/lib/utils";
import {
  CancelExtensionButton,
  CancelLoanButton,
  CancelPickupButton,
  CheckUnitsLink,
  DeliverDialog,
  EditLoanLink,
  ExtendLoanDialog,
  ItemSenderDialog,
  PickupDialog,
  PrintFormLink,
  PrintHafLink,
  ResolveFollowUpDialog,
} from "../loan-actions";
import { LoanStatus } from "../loan-table";

export const metadata: Metadata = { title: "Detail Peminjaman Unit" };

const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

/**
 * Detail peminjaman (Fase 16.2). Semua user Inventaris boleh melihat. Aksi sesuai peran: approver (Ko Yosep) menyetujui /
 * menolak di sini atau di Approval Center; pemohon mengubah / membatalkan selama belum disetujui; langkah Operational
 * (Item Sender, Sudah Diantar, jadwalkan pengambilan / HAF, Pengecekan Unit) HANYA untuk user yang ditunjuk Operational —
 * Admin tidak otomatis (2026-11-19). Pengecekan juga dicek ulang di server.
 */
export default async function DemoLoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, access } = await requireInventory("view");
  const { id } = await params;
  const loan = await getDemoLoanDetail(prisma, id);
  if (!loan) notFound();

  const isOperational = access.isOperational;
  const isRequester = loan.requesterId === user.id;
  const canEdit = isRequester && isEditableLoanStatus(loan.status) && !loan.approval.partlyApproved;
  const canCancel = isRequester && isEditableLoanStatus(loan.status);
  const canPrepare = isOperational && loan.status === "APPROVED";
  // Form bisa dicetak sejak disetujui (dan dicetak ulang setelah diantar).
  const canPrint = ["APPROVED", "ON_LOAN", "PICKUP", "RETURN_REVIEW", "FOLLOW_UP", "RETURNED"].includes(loan.status);
  // Pengambilan (2026-11-19): Operational menjadwalkan → HAF terbit (siapa pun bisa mencetak), lalu Pengecekan Unit.
  const canSchedulePickup = isOperational && loan.status === "ON_LOAN";
  const pickingUp = loan.status === "PICKUP";
  const canManagePickup = isOperational && pickingUp;
  // Sudah dicek (revisi 2026-11-20): unit bermasalah → Perlu Tindak Lanjut dulu, lalu verifikasi engineer → Selesai.
  const reviewing = loan.status === "RETURN_REVIEW";
  const followUp = loan.status === "FOLLOW_UP";
  const returned = loan.status === "RETURNED" || followUp || reviewing;
  const canPrintHaf = (pickingUp || returned) && Boolean(loan.hafNumber);
  const followUpUnits = loan.items
    .filter((item) => isProblemCondition(item.returnCondition) && !item.resolvedCondition)
    .map((item) => ({ itemId: item.id, deviceName: item.deviceName, serialNo: item.serialNo, condition: item.returnCondition!, note: item.returnNote }));
  const canResolve = isOperational && followUp && followUpUnits.length > 0;
  // Perpanjangan (Tahap 16.4): pemohon / Operational selama dipinjam, satu yang menunggu sekaligus, maks. 2 tahun.
  const pendingExtension = loan.extensions.find((extension) => extension.status === "PENDING") ?? null;
  const canExtend = loan.status === "ON_LOAN" && !pendingExtension && (isRequester || isOperational) && maxLoanEnd(loan.startDate) > loan.dueDate;
  const [approval, returnApprovalRow, senders, extensionApprovals] = await Promise.all([
    user.role !== "STAFF" ? getApprovalForEntity(prisma, "DEMO_LOAN", loan.id, user) : null,
    // Verifikasi hasil Pengecekan Unit (2026-11-20): Setujui / Tolak untuk approver-nya (Ko Yosep).
    user.role !== "STAFF" && loan.returnApproval.steps.length ? getApprovalForEntity(prisma, "DEMO_LOAN_RETURN", loan.id, user) : null,
    canPrepare || canSchedulePickup || canManagePickup ? getItemSenderOptions(prisma) : [],
    // Keputusan perpanjangan (Setujui / Tolak / Batalkan persetujuan) untuk approver & Admin.
    user.role !== "STAFF"
      ? Promise.all(loan.extensions.map((extension) => getApprovalForEntity(prisma, "DEMO_LOAN_EXTENSION", extension.id, user)))
      : [],
  ]);
  const extensionActions = new Map(
    loan.extensions.map((extension, index) => [extension.id, extensionApprovals[index] ?? null] as const).filter(([, row]) => row && (row.canApprove || row.canRevoke)),
  );
  const showApprovalActions = Boolean(approval && (approval.canApprove || approval.canRevoke));
  const showReturnActions = Boolean(returnApprovalRow && (returnApprovalRow.canApprove || returnApprovalRow.canRevoke));

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
          (showApprovalActions || showReturnActions || canPrepare || canPrint || canPrintHaf || canSchedulePickup || canManagePickup || canResolve || canEdit || canCancel || canExtend) && (
            <>
              {showApprovalActions && approval && <RowActions row={approval} />}
              {showReturnActions && returnApprovalRow && <RowActions row={returnApprovalRow} />}
              {canResolve && <ResolveFollowUpDialog loanId={loan.id} units={followUpUnits} />}
              {canPrepare && <ItemSenderDialog loanId={loan.id} senders={senders} current={loan.itemSenderId} />}
              {canPrint && <PrintFormLink loanId={loan.id} primary={canPrepare && Boolean(loan.itemSenderId)} />}
              {canPrintHaf && <PrintHafLink loanId={loan.id} primary={pickingUp && !canManagePickup} />}
              {canManagePickup && <CheckUnitsLink loanId={loan.id} />}
              {canSchedulePickup && <PickupDialog loanId={loan.id} couriers={senders} deliveredAt={loan.deliveredAt} current={null} />}
              {canManagePickup && loan.pickupDate && (
                <PickupDialog loanId={loan.id} couriers={senders} deliveredAt={loan.deliveredAt} current={{ pickupDate: loan.pickupDate, courierId: loan.courierId }} />
              )}
              {canExtend && <ExtendLoanDialog loanId={loan.id} startDate={loan.startDate} dueDate={loan.dueDate} />}
              {canPrepare && loan.itemSenderId && <DeliverDialog loanId={loan.id} startDate={loan.startDate} submittedAt={loan.submittedAt} />}
              {canManagePickup && <CancelPickupButton loanId={loan.id} />}
              {canCancel && <CancelLoanButton loanId={loan.id} borrowerName={loan.borrowerName} />}
              {canEdit && <EditLoanLink loanId={loan.id} rejected={loan.status === "REJECTED"} />}
            </>
          )
        }
      />

      <StatusNote
        loan={loan}
        isRequester={isRequester}
        isOperational={isOperational}
        isPic={Boolean(user.employeeId) && user.employeeId === loan.picId}
        canVerify={Boolean(returnApprovalRow?.canApprove)}
        canApprove={Boolean(approval?.canApprove)}
        canExtend={canExtend}
        pendingExtension={pendingExtension}
      />

      <section className="grid gap-x-8 gap-y-4 rounded-2xl bg-card p-5 shadow-card sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Kegunaan" value={LOAN_PURPOSE_LABEL[loan.purpose]} sub={loanPurposeDescription(loan.purpose, loan.purposeDetail)} />
        <Info label="Lend To" value={loan.borrowerName} sub={loan.customerId ? "Data Customer" : "Perusahaan baru (diketik pemohon)"} />
        <Info
          label="Kontak peminjam (up:)"
          value={loan.contactName}
          sub={
            <a href={`mailto:${loan.contactEmail}`} className="underline-offset-4 hover:underline">
              {loan.contactEmail}
            </a>
          }
        />
        <Info label="Trial periode" value={`${date(loan.startDate)} – ${date(loan.dueDate)}`} sub={`${loan.durationLabel} · jatuh tempo ${date(loan.dueDate)}`} />
        <Info label="PIC" value={loan.picName} sub="Penanggung jawab dari AMI" />
        <Info label="Pemilik unit" value={loan.unitOwner === AMI_OWNER ? "Milik AMI" : loan.unitOwner} sub="Tertulis di nomor form" />
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
        {loan.pickupDate && (
          <Info
            label="Pengambilan"
            value={date(loan.pickupDate)}
            sub={[loan.courierName && `Kurir ${loan.courierName}`, loan.hafPreparerName && `HAF diterbitkan ${loan.hafPreparerName}`].filter(Boolean).join(" · ") || undefined}
          />
        )}
        {loan.hafNumber && <Info label="No. HAF" value={<span className="font-mono">{loan.hafNumber}</span>} sub="Hardware Admission Form" />}
        {loan.returnedAt && (
          <Info
            label="Tiba & dicek"
            value={date(loan.returnedAt)}
            sub={[loan.returnedByName && `Diserahkan ${loan.returnedByName}`, loan.returnReceiverName && `dicek ${loan.returnReceiverName}`].filter(Boolean).join(", ") || undefined}
          />
        )}
        {loan.remarks && <Info label="Keperluan (Remarks)" value={loan.remarks} className="sm:col-span-2" />}
        {loan.returnNote && <Info label="Catatan pengembalian" value={loan.returnNote} className="sm:col-span-2" />}
        {loan.followUpNote && (
          <Info
            label="Tindak lanjut"
            value={loan.followUpNote}
            sub={[loan.followUpResolverName && `Diselesaikan ${loan.followUpResolverName}`, loan.followUpResolvedAt && formatDateTime(loan.followUpResolvedAt)].filter(Boolean).join(", ") || undefined}
            className="sm:col-span-2"
          />
        )}
      </section>

      {loan.approval.steps.length > 0 && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <h2 className="mb-4 text-base font-semibold">Riwayat Approval</h2>
          <ApprovalStepper steps={loan.approval.steps} requestStatus={loan.approval.status ?? "PENDING"} />
        </section>
      )}

      {/* Verifikasi hasil Pengecekan Unit oleh engineer (2026-11-20). */}
      {loan.returnApproval.steps.length > 0 && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <h2 className="mb-4 text-base font-semibold">Verifikasi Pengecekan Unit</h2>
          <ApprovalStepper steps={loan.returnApproval.steps} requestStatus={loan.returnApproval.status ?? "PENDING"} />
        </section>
      )}

      {loan.extensions.length > 0 && (
        <section id="perpanjangan" className="flex scroll-mt-24 flex-col gap-3" aria-labelledby="perpanjangan-title">
          <h2 id="perpanjangan-title" className="text-lg font-semibold">
            Perpanjangan ({loan.extensions.length})
          </h2>
          <ul className="flex flex-col gap-3">
            {loan.extensions.map((extension) => {
              const actions = extensionActions.get(extension.id);
              return (
                <li key={extension.id} className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {date(extension.previousDueDate)} → {date(extension.newDueDate)}
                        <StatusBadge variant={EXTENSION_STATUS_VARIANT[extension.status]}>{EXTENSION_STATUS_LABEL[extension.status]}</StatusBadge>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Periode menjadi {date(loan.startDate)} – {date(extension.newDueDate)} ({extension.newDurationLabel}) · diajukan {extension.requesterName},{" "}
                        {formatDateTime(extension.createdAt)}
                      </p>
                      <p className="mt-2 text-sm wrap-anywhere whitespace-pre-line">{extension.reason}</p>
                      {extension.approval.rejection && extension.status !== "CANCELLED" && (
                        <p className="mt-2 text-sm text-red-deep">
                          Ditolak {extension.approval.rejection.by}: {extension.approval.rejection.reason}
                        </p>
                      )}
                      {extension.status === "CANCELLED" && extension.approval.rejection && (
                        <p className="mt-2 text-sm text-muted-foreground">{extension.approval.rejection.reason}</p>
                      )}
                    </div>
                    {(actions || (extension.status === "PENDING" && extension.requesterId === user.id)) && (
                      <div className="flex flex-wrap items-center gap-2">
                        {actions && <RowActions row={actions} />}
                        {extension.status === "PENDING" && extension.requesterId === user.id && <CancelExtensionButton extensionId={extension.id} />}
                      </div>
                    )}
                  </div>
                  {extension.approval.steps.length > 0 && extension.status !== "CANCELLED" && (
                    <ApprovalStepper steps={extension.approval.steps} requestStatus={extension.approval.status ?? "PENDING"} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Unit ({loan.itemCount})</h2>
        <TableScroll as="div" label="Unit yang dipinjam" className="rounded-2xl bg-card shadow-card">
          <table className={cn("w-full text-sm", returned ? "min-w-[760px]" : "min-w-[560px]")}>
            <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Part number / deskripsi</th>
                <th className="px-4 py-3">Serial number</th>
                <th className="px-4 py-3">{returned ? "Diambil dari" : "Posisi rak"}</th>
                {returned && <th className="px-4 py-3">Kondisi kembali</th>}
                {returned && <th className="px-4 py-3">Ditaruh di</th>}
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
                  <td className="px-4 py-3 font-mono text-xs">{item.serialNo ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={cn(!item.location && "text-muted-foreground")}>{item.location ?? "Tidak di rak"}</span>
                    {!returned && item.currentLocation !== item.location && (
                      <span className="block text-xs text-warning">Sekarang: {item.currentLocation ?? "tidak di rak"}</span>
                    )}
                  </td>
                  {returned && (
                    <td className="px-4 py-3">
                      {item.returnCondition ? (
                        <>
                          <StatusBadge variant={RETURN_CONDITION_VARIANT[item.returnCondition]}>{RETURN_CONDITION_LABEL[item.returnCondition]}</StatusBadge>
                          {item.returnNote && <span className="mt-1 block text-xs wrap-anywhere text-muted-foreground">{item.returnNote}</span>}
                          {/* Hasil tindak lanjut (2026-11-20) / masih ditindaklanjuti. */}
                          {item.resolvedCondition && (
                            <span className="mt-1 block text-xs font-semibold">
                              Setelah tindak lanjut: {item.resolvedCondition === "GOOD" ? "lengkap / sudah diperbaiki" : `tetap ${RETURN_CONDITION_LABEL[item.resolvedCondition].toLowerCase()}`}
                            </span>
                          )}
                          {followUp && isProblemCondition(item.returnCondition) && !item.resolvedCondition && (
                            <span className="mt-1 block text-xs font-semibold text-red-deep">Ditindaklanjuti · unit tertahan</span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                  {returned && (
                    <td className="px-4 py-3">
                      <span className={cn(!item.returnLocation && "text-muted-foreground")}>{item.returnLocation ?? "Tidak di rak"}</span>
                    </td>
                  )}
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
function StatusNote({
  loan,
  isRequester,
  isOperational,
  isPic,
  canVerify,
  canApprove,
  canExtend,
  pendingExtension,
}: {
  loan: LoanDetail;
  isRequester: boolean;
  isOperational: boolean;
  isPic: boolean;
  /** Approver verifikasi Pengecekan Unit (2026-11-20). */
  canVerify: boolean;
  canApprove: boolean;
  canExtend: boolean;
  pendingExtension: LoanExtensionView | null;
}) {
  const waitingFor = loan.approval.steps.find((step) => step.status === "PENDING")?.approvers.join(" / ");
  const approvedBy = loan.approval.steps.filter((step) => step.status === "APPROVED" && step.actedBy).at(-1)?.actedBy;
  let tone: "info" | "warning" | "danger" | "success" | "neutral";
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
          {isOperational
            ? loan.itemSenderName
              ? `Item Sender: ${loan.itemSenderName}. Cetak form untuk ditandatangani, antar barang, lalu tekan Sudah Diantar.`
              : "Siapkan barang dari posisi rak yang tertera, lalu pilih Item Sender (pengantar barang) dan cetak form."
            : `Barang sedang disiapkan Operational${loan.itemSenderName ? ` dan diantar oleh ${loan.itemSenderName}` : ""}.`}
        </>
      );
      break;
    case "ON_LOAN": {
      // Tahap 16.4: sisa hari / terlambat, perpanjangan yang menunggu, dan siapa yang diingatkan.
      const daysLeft = loan.daysLeft ?? 0;
      const soon = daysLeft <= DUE_SOON_DAYS;
      tone = loan.overdue ? "danger" : soon ? "warning" : "info";
      icon = loan.overdue || soon ? CircleAlert : Clock;
      const extensionWaiting = pendingExtension?.approval.steps.find((step) => step.status === "PENDING")?.approvers.join(" / ");
      body = (
        <>
          <span className="font-semibold">
            {loan.overdue ? `Terlambat ${-daysLeft} hari` : `Sedang dipinjam — jatuh tempo ${dueLabel(daysLeft)}`} ({date(loan.dueDate)}).
          </span>{" "}
          Diantar {loan.deliveredAt ? date(loan.deliveredAt) : "—"}
          {loan.itemSenderName && ` oleh ${loan.itemSenderName}`}
          {loan.receivedByName && `, diterima ${loan.receivedByName}`}.
          {pendingExtension && (
            <span className="block pt-1">
              Perpanjangan s/d {date(pendingExtension.newDueDate)} menunggu approval{extensionWaiting ? ` ${extensionWaiting}` : ""} — jatuh tempo belum berubah.
            </span>
          )}
          {(soon || loan.overdue) && (
            <span className="block pt-1">
              Pemohon & Operational diingatkan lewat email dan lonceng
              {canExtend ? ". Bila unit masih dipakai, ajukan perpanjangan." : "."}
            </span>
          )}
          {isOperational && (
            <span className="block pt-1">
              Saat barang akan diambil, tekan Jadwalkan Pengambilan — Hardware Admission Form terbit untuk dibawa kurir.
            </span>
          )}
        </>
      );
      break;
    }
    case "PICKUP": {
      // Pengambilan (2026-11-19): HAF dibawa kurir; Operational wajib mengisi Pengecekan Unit setelah barang tiba.
      // Verifikasi engineer ditolak (2026-11-20) → kembali ke sini untuk dicek ulang.
      const rejected = loan.returnApproval.status === "REJECTED" ? loan.returnApproval.rejection : null;
      tone = rejected ? "danger" : "info";
      icon = rejected ? CircleAlert : Truck;
      body = rejected ? (
        <>
          <span className="font-semibold">
            Verifikasi pengecekan ditolak {rejected.by}, {formatDateTime(rejected.at)}:
          </span>{" "}
          {rejected.reason}
          <span className="block pt-1">
            {isOperational
              ? "Cek ulang unit sesuai catatan, lalu buka Pengecekan Unit dan simpan lagi. Unit yang masih rusak / tidak lengkap ditindaklanjuti dulu, baru diverifikasi lagi."
              : "Operational mengecek ulang unit (dan menindaklanjuti unit bermasalah), lalu hasilnya diverifikasi lagi."}
          </span>
        </>
      ) : (
        <>
          <span className="font-semibold">
            Pengambilan dijadwalkan {loan.pickupDate ? date(loan.pickupDate) : ""}
            {loan.courierName && ` oleh kurir ${loan.courierName}`}.
          </span>{" "}
          {isOperational
            ? `Cetak HAF ${loan.hafNumber ?? ""} (asli + copy) untuk dibawa kurir. Setelah barang tiba di AMI, wajib isi Pengecekan Unit: cek setiap unit dan taruh kembali di rak.`
            : `HAF ${loan.hafNumber ?? ""} dibawa kurir. Setelah barang tiba di AMI, Operational mengecek setiap unit.`}
        </>
      );
      break;
    }
    case "RETURN_REVIEW": {
      // Verifikasi engineer (2026-11-20): hasil Pengecekan Unit (+ tindak lanjutnya, revisi 2026-11-20) menunggu approval.
      const verifier = loan.returnApproval.steps.find((step) => step.status === "PENDING")?.approvers.join(" / ");
      const problems = loan.items.filter((item) => isProblemCondition(item.returnCondition)).length;
      const followedUp = loan.items.some((item) => isProblemCondition(item.returnCondition) && item.resolvedCondition);
      tone = "info";
      icon = Clock;
      body = (
        <>
          <span className="font-semibold">
            Menunggu verifikasi{verifier ? ` ${verifier}` : " engineer"} — barang tiba {loan.returnedAt ? date(loan.returnedAt) : "—"}
            {loan.returnReceiverName && `, dicek ${loan.returnReceiverName}`}.
          </span>{" "}
          {problems
            ? `${problems} unit dicatat rusak / tidak lengkap${followedUp ? ` dan sudah ditindaklanjuti${loan.followUpNote ? ` (${loan.followUpNote})` : ""}` : ""}. `
            : "Semua unit dicatat Baik. "}
          {canVerify
            ? "Cek ulang fisik setiap unit (dan hasil tindak lanjutnya) di tabel bawah; Setujui bila sesuai, atau Tolak dengan alasan supaya Operational mengecek ulang."
            : "Unit tertahan sampai hasil pengecekan disetujui; setelah itu peminjaman Selesai."}
        </>
      );
      break;
    }
    case "FOLLOW_UP": {
      // Tindak lanjut (2026-11-20): unit Rusak / Tidak lengkap belum diselesaikan — belum Selesai.
      const problems = loan.items.filter((item) => isProblemCondition(item.returnCondition) && !item.resolvedCondition);
      tone = "danger";
      icon = CircleAlert;
      body = (
        <>
          <span className="font-semibold">
            Perlu tindak lanjut — {problems.length} unit kembali rusak / tidak lengkap (tiba {loan.returnedAt ? date(loan.returnedAt) : "—"}
            {loan.returnReceiverName && `, dicek ${loan.returnReceiverName}`}).
          </span>
          <span className="mt-1 block">
            {problems.map((item) => (
              <span key={item.id} className="block">
                {item.deviceName}{item.serialNo && ` (SN ${item.serialNo})`} — {item.returnCondition ? RETURN_CONDITION_LABEL[item.returnCondition] : ""}
                {item.returnNote && `: ${item.returnNote}`}
              </span>
            ))}
          </span>
          <span className="block pt-1">
            {isOperational
              ? "Tindak lanjuti bersama PIC; setelah beres, tekan Selesaikan Tindak Lanjut — hasilnya lalu diverifikasi engineer. Semua unit peminjaman ini tertahan sampai verifikasi disetujui."
              : isPic
                ? "Anda PIC peminjaman ini — bantu tindak lanjuti dengan peminjam. Operational menutup tindak lanjut setelah beres, lalu engineer memverifikasi."
                : "PIC & Operational sedang menindaklanjuti; setelah itu engineer memverifikasi. Semua unit peminjaman ini tertahan sampai verifikasi disetujui."}
          </span>
        </>
      );
      break;
    }
    case "RETURNED": {
      // Kondisi akhir (setelah tindak lanjut bila ada): yang tetap rusak / tidak lengkap tetap disebut.
      const flagged = loan.items.filter((item) => isProblemCondition(finalCondition(item))).length;
      tone = flagged ? "warning" : "success";
      icon = flagged ? CircleAlert : CircleCheck;
      body = (
        <>
          <span className="font-semibold">
            Selesai — barang tiba di AMI {loan.returnedAt ? date(loan.returnedAt) : ""}
            {loan.returnReceiverName && `, dicek ${loan.returnReceiverName}`}.
          </span>{" "}
          {flagged
            ? `${flagged} unit tetap rusak / tidak lengkap setelah tindak lanjut — lihat kolom Kondisi kembali.`
            : loan.followUpNote
              ? "Tindak lanjut selesai; semua unit sudah lengkap / diperbaiki dan bisa dipinjam lagi."
              : "Semua unit kembali dalam kondisi baik dan sudah ditaruh di rak."}
        </>
      );
      break;
    }
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
    warning: "bg-amber-soft text-amber-deep",
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
