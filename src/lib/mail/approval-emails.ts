// Ubah notifikasi approval engine (user id penerima) → email siap kirim (URD NTF-01..03).
import type { PrismaClient } from "@/generated/prisma/client";
import { APPROVAL_MODULE_META } from "@/lib/approval-modules";
import type { ApprovalNotification } from "@/lib/services/approval";
import { appUrl } from "./app-url";
import { enqueueEmails, type OutgoingEmail } from "./queue";

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
