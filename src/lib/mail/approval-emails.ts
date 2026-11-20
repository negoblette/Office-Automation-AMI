// Ubah notifikasi approval engine (user id penerima) → email siap kirim (URD NTF-01..03).
import type { ApprovalModule, PrismaClient } from "@/generated/prisma/client";
import { formatDuration } from "@/lib/attendance";
import { formatDate, formatRupiah, formatTime, toJakartaIsoDate } from "@/lib/format";
import { APPROVAL_MODULE_META } from "@/lib/approval-modules";
import { formatLoanDuration, groupLoanItems, LOAN_PURPOSE_HINT, LOAN_PURPOSE_LABEL, RETURN_CONDITION_LABEL } from "@/lib/demo-loan";
import { enqueueDemoLoanEmails, enqueueLoanExtendedEmails, enqueueLoanFollowUpEmails } from "./demo-loan-emails";
import { LEAVE_TYPE_LABEL, leaveDeductLabel, projectLabel } from "@/lib/labels";
import { overtimeMinutes } from "@/lib/validators/overtime";
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
    case "OVERTIME": {
      const o = await db.overtime.findUnique({ where: { id: entityId }, include: { customer: { select: { name: true } }, project: { select: { code: true, name: true } } } });
      if (!o?.clockOut) return [];
      return [
        `Overtime: ${formatDate(o.date)}, ${formatTime(o.clockIn)}–${formatTime(o.clockOut)} (${formatDuration(overtimeMinutes(o.clockIn, o.clockOut))})`,
        `Customer / project: ${o.customer?.name ?? "—"} · ${o.project ? projectLabel(o.project) : "—"}`,
        `Pekerjaan: ${o.activity ?? "—"}`,
      ];
    }
    case "HEALTH": {
      const c = await db.healthClaim.findUnique({ where: { id: entityId }, include: { category: { select: { name: true } }, _count: { select: { items: true } } } });
      return c ? [`Klaim ${c._count.items > 1 ? `${c._count.items} baris` : c.category.name}: ${formatRupiah(Number(c.amount))}`] : [];
    }
    case "DEMO_LOAN": {
      const loan = await db.demoLoan.findUnique({
        where: { id: entityId },
        include: { pic: { select: { fullName: true } }, items: { select: { deviceName: true, serialNo: true }, orderBy: { id: "asc" } } },
      });
      if (!loan) return [];
      return [
        loan.purpose === "OTHER" ? `Kegunaan: Lainnya — ${loan.purposeDetail ?? "-"}` : `Kegunaan: ${LOAN_PURPOSE_LABEL[loan.purpose]} (${LOAN_PURPOSE_HINT[loan.purpose].toLowerCase()})`,
        `Peminjam: ${loan.borrowerName} (up: ${loan.contactName})`,
        `PIC: ${loan.pic.fullName}`,
        `Periode: ${formatDate(loan.startDate)} – ${formatDate(loan.dueDate)} (${formatLoanDuration(toJakartaIsoDate(loan.startDate), toJakartaIsoDate(loan.dueDate))})`,
        ...groupLoanItems(loan.items).map((group) => `${group.deviceName} ×${group.serials.length} — SN ${group.serials.join(", ")}`),
      ];
    }
    case "DEMO_LOAN_EXTENSION": {
      const extension = await db.demoLoanExtension.findUnique({ where: { id: entityId }, include: { loan: { select: { borrowerName: true, contactName: true, startDate: true } } } });
      if (!extension) return [];
      return [
        `Peminjam: ${extension.loan.borrowerName} (up: ${extension.loan.contactName})`,
        `Jatuh tempo: ${formatDate(extension.previousDueDate)} → ${formatDate(extension.newDueDate)}`,
        `Periode menjadi: ${formatDate(extension.loan.startDate)} – ${formatDate(extension.newDueDate)} (${formatLoanDuration(toJakartaIsoDate(extension.loan.startDate), toJakartaIsoDate(extension.newDueDate))})`,
        `Alasan: ${extension.reason}`,
      ];
    }
    case "DEMO_LOAN_RETURN": {
      // Verifikasi Pengecekan Unit (2026-11-20): hasil cek Operational per unit, supaya engineer bisa mencocokkan fisiknya.
      const loan = await db.demoLoan.findUnique({
        where: { id: entityId },
        include: { items: { orderBy: { id: "asc" }, include: { returnRack: { select: { name: true } } } } },
      });
      if (!loan) return [];
      return [
        `Peminjam: ${loan.borrowerName}${loan.hafNumber ? ` · HAF ${loan.hafNumber}` : ""}`,
        ...(loan.returnedAt ? [`Tiba & dicek: ${formatDate(loan.returnedAt)}`] : []),
        ...loan.items.map(
          (item) =>
            `${item.deviceName} · SN ${item.serialNo} — ${item.returnCondition ? RETURN_CONDITION_LABEL[item.returnCondition] : "-"}${item.returnNote ? `: ${item.returnNote}` : ""}${
              item.returnRack && item.returnRackPosition ? ` · ditaruh ${item.returnRack.name} ${item.returnRackPosition}` : ""
            }`,
        ),
        ...(loan.returnNote ? [`Catatan pengembalian: ${loan.returnNote}`] : []),
      ];
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
      statusLine = `Ditolak oleh ${by}${rejected?.note ? `: ${rejected.note}` : ""}. ${
        request.module === "DEMO_LOAN_EXTENSION"
          ? "Jatuh tempo tidak berubah; ajukan perpanjangan baru bila unit masih dipakai."
          : request.module === "DEMO_LOAN_RETURN"
            ? "Cek ulang unit sesuai catatan, lalu simpan Pengecekan Unit lagi."
            : "Silakan revisi lalu ajukan ulang."
      }`;
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
    // Peminjaman unit disetujui final (Fase 16): Operational diberi tahu untuk menyiapkan barang & mencetak form.
    if (notification.template === "approval-final") {
      const request = await db.approvalRequest.findUnique({ where: { id: notification.requestId }, select: { module: true, entityId: true } });
      if (request?.module === "DEMO_LOAN") await enqueueDemoLoanEmails(db, request.entityId, "loan-approved");
      // Perpanjangan disetujui (Tahap 16.4): Operational diberi tahu jatuh tempo baru.
      if (request?.module === "DEMO_LOAN_EXTENSION") await enqueueLoanExtendedEmails(db, request.entityId);
      // Pengecekan diverifikasi (2026-11-20): ada unit bermasalah → email tindak lanjut ke PIC & Operational
      // (fungsinya sendiri tidak mengirim apa pun bila peminjaman Selesai).
      if (request?.module === "DEMO_LOAN_RETURN") await enqueueLoanFollowUpEmails(db, request.entityId);
    }
  }
}
