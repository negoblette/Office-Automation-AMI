// Ubah notifikasi approval engine (user id penerima) → email siap kirim (URD NTF-01..03).
import type { ApprovalModule, PrismaClient } from "@/generated/prisma/client";
import { formatDate, formatRupiah } from "@/lib/format";
import { APPROVAL_MODULE_META } from "@/lib/approval-modules";
import { LEAVE_TYPE_LABEL, leaveDeductLabel } from "@/lib/labels";
import type { ApprovalNotification } from "@/lib/services/approval";
import { appUrl } from "./app-url";
import { enqueueEmails, type OutgoingEmail } from "./queue";

/** Rincian singkat isi pengajuan di badan email (2026-10-12: cuti → tanggal, jumlah hari, alasan). */
async function detailLines(db: PrismaClient, module: ApprovalModule, entityId: string): Promise<string[]> {
  switch (module) {
    case "LEAVE": {
      const leave = await db.leaveRequest.findUnique({ where: { id: entityId } });
      if (!leave) return [];
      const start = formatDate(leave.startDate);
      const end = formatDate(leave.endDate);
      return [
        `Jenis: ${LEAVE_TYPE_LABEL[leave.type]}${leave.deductDays >= leave.workingDays ? "" : ` (${leaveDeductLabel(leave.deductDays, leave.workingDays)})`}`,
        `Tanggal cuti: ${start === end ? start : `${start} – ${end}`} (${leave.workingDays} hari kerja)`,
        `Alasan: ${leave.reason}`,
      ];
    }
    case "REIMBURSE": {
      const r = await db.reimbursement.findUnique({ where: { id: entityId }, include: { _count: { select: { items: true } } } });
      return r ? [`Total: ${formatRupiah(Number(r.total))} (${r._count.items} baris)`] : [];
    }
    case "HEALTH": {
      const c = await db.healthClaim.findUnique({ where: { id: entityId }, include: { category: { select: { name: true } } } });
      return c ? [`Klaim ${c.category.name}: ${formatRupiah(Number(c.amount))}`] : [];
    }
    default:
      return [];
  }
}

export async function buildApprovalEmails(db: PrismaClient, notification: ApprovalNotification): Promise<OutgoingEmail[]> {
  const request = await db.approvalRequest.findUniqueOrThrow({
    where: { id: notification.requestId },
    include: {
      requester: { select: { email: true, employee: { select: { fullName: true } } } },
      steps: { orderBy: { level: "asc" }, include: { actedBy: { select: { employee: { select: { fullName: true } } } } } },
    },
  });
  const recipients = await db.user.findMany({
    where: { id: { in: notification.recipientIds }, isActive: true },
    select: { id: true, email: true, employee: { select: { fullName: true } } },
  });

  const meta = APPROVAL_MODULE_META[request.module];
  const details = await detailLines(db, request.module, request.entityId);
  const requesterName = request.requester.employee?.fullName ?? request.requester.email;
  const lastApproved = request.steps.filter((step) => step.status === "APPROVED").at(-1);
  const approverName = lastApproved?.actedBy?.employee?.fullName;

  let subject: string;
  let statusLine: string;
  let path: string;
  switch (notification.template) {
    case "approval-requested":
      subject = `[Approval] ${meta.label} ${request.entityNumber} dari ${requesterName}`;
      statusLine = `Menunggu persetujuan Anda (level ${request.currentLevel}).`;
      path = "/approval";
      break;
    case "approval-progress":
      subject = `[Diproses] ${meta.label} ${request.entityNumber}`;
      statusLine = `Disetujui L${lastApproved?.level} oleh ${approverName}, menunggu persetujuan L${request.currentLevel}.`;
      path = meta.path(request.entityId);
      break;
    case "approval-rejected": {
      const rejected = await db.approvalRequestStep.findFirst({
        where: { requestId: request.id, status: "REJECTED" },
        include: { actedBy: { select: { email: true, employee: { select: { fullName: true } } } } },
      });
      const by = rejected?.actedBy?.employee?.fullName ?? rejected?.actedBy?.email ?? "approver";
      subject = `[Ditolak] ${meta.label} ${request.entityNumber}`;
      statusLine = `Ditolak oleh ${by}${rejected?.note ? `: ${rejected.note}` : ""}. Silakan revisi lalu ajukan ulang.`;
      path = meta.path(request.entityId);
      break;
    }
    case "approval-final":
      subject = `[Disetujui] ${meta.label} ${request.entityNumber}`;
      statusLine = lastApproved
        ? `Disetujui final oleh ${approverName}.`
        : "Disetujui otomatis (pemohon tidak memerlukan approval).";
      path = meta.path(request.entityId);
      break;
  }

  return recipients.map((recipient) => ({
    to: recipient.email,
    subject,
    template: notification.template,
    props: {
      template: notification.template,
      recipientName: recipient.employee?.fullName ?? recipient.email,
      requesterName,
      moduleLabel: meta.label,
      entityNumber: request.entityNumber,
      statusLine,
      details,
      url: appUrl(path),
    },
  }));
}

/** Panggil SETELAH transaksi submit/approve commit. */
export async function enqueueApprovalNotifications(db: PrismaClient, notifications: ApprovalNotification[]) {
  for (const notification of notifications) {
    await enqueueEmails(db, await buildApprovalEmails(db, notification));
  }
}
