// Email peminjaman unit demo khusus Operational (Fase 16, 2026-11-17). Pengajuan, persetujuan, dan penolakan memakai
// email approval engine (approval-emails.ts: ke Ko Yosep & pemohon). Di sini: setelah disetujui final → Operational aktif
// (belum diatur → Admin aktif) diminta menyiapkan barang & mencetak form. Pengingat jatuh tempo (16.4) ke pemohon &
// Operational; tidak ada email ke perusahaan peminjam (keputusan user 2026-11-17).
import type { PrismaClient } from "@/generated/prisma/client";
import { formatLoanDuration, groupLoanItems, loanPurposeText } from "@/lib/demo-loan";
import { formatDate, toJakartaIsoDate } from "@/lib/format";
import { getOperationalUserIds } from "@/lib/services/inventory-access";
import type { DemoLoanEmailTemplate } from "./templates/demo-loan-email";
import { appUrl } from "./app-url";
import { enqueueEmails, type OutgoingEmail } from "./queue";

const recipientSelect = { id: true, email: true, employee: { select: { fullName: true } } } as const;

/** Operational aktif; bila belum diatur, Admin aktif (supaya peminjaman yang disetujui tidak terlewat). */
export async function operationalRecipients(db: PrismaClient) {
  const operational = await db.user.findMany({ where: { id: { in: await getOperationalUserIds(db) }, isActive: true }, select: recipientSelect });
  return operational.length ? operational : db.user.findMany({ where: { role: "ADMIN", isActive: true }, select: recipientSelect });
}

export async function buildDemoLoanEmails(
  db: PrismaClient,
  loanId: string,
  template: DemoLoanEmailTemplate,
): Promise<OutgoingEmail<DemoLoanEmailTemplate>[]> {
  const loan = await db.demoLoan.findUniqueOrThrow({
    where: { id: loanId },
    include: {
      requester: { select: { email: true, employee: { select: { fullName: true } } } },
      salesPerson: { select: { fullName: true } },
      items: { select: { deviceName: true, serialNo: true }, orderBy: { id: "asc" } },
    },
  });
  const requesterName = loan.requester.employee?.fullName ?? loan.requester.email;
  const details = [
    `Kegunaan: ${loanPurposeText(loan.purpose, loan.purposeDetail)}`,
    `Periode: ${formatDate(loan.startDate, "short")} – ${formatDate(loan.dueDate, "short")} (${formatLoanDuration(toJakartaIsoDate(loan.startDate), toJakartaIsoDate(loan.dueDate))})`,
    `PIC peminjam: ${loan.picName} (${loan.picEmail})`,
    `Sales Person: ${loan.salesPerson.fullName}`,
    ...groupLoanItems(loan.items).map((group) => `${group.deviceName} ×${group.serials.length} — SN ${group.serials.join(", ")}`),
    ...(loan.remarks ? [`Keperluan: ${loan.remarks}`] : []),
  ];
  const recipients = await operationalRecipients(db);
  return recipients.map((recipient) => ({
    to: recipient.email,
    subject: `[Peminjaman Unit] Siapkan ${loan.number} — ${loan.borrowerName}`,
    template,
    props: {
      template,
      recipientName: recipient.employee?.fullName ?? recipient.email,
      requesterName,
      borrowerName: loan.borrowerName,
      number: loan.number,
      statusLine: "Sudah disetujui. Siapkan barang di posisi rak yang tertera, pilih Item Sender, lalu cetak Product Trial Form.",
      details,
      url: appUrl(`/inventory/peminjaman/${loan.id}`),
    },
  }));
}

/** Kirim email peminjaman ke antrian. Gagal menyusun email tidak menggagalkan aksi user (sudah commit). */
export async function enqueueDemoLoanEmails(db: PrismaClient, loanId: string, template: DemoLoanEmailTemplate): Promise<void> {
  try {
    await enqueueEmails(db, await buildDemoLoanEmails(db, loanId, template));
  } catch (error) {
    console.error("[mail] gagal menyusun email peminjaman", error);
  }
}
