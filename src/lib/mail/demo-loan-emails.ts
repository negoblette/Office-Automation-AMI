// Email peminjaman unit demo khusus Operational (Fase 16, 2026-11-17). Pengajuan, persetujuan, dan penolakan memakai
// email approval engine (approval-emails.ts: ke Ko Yosep & pemohon). Di sini: setelah disetujui final → Operational aktif
// (belum diatur → Admin aktif) diminta menyiapkan barang & mencetak form. Pengingat jatuh tempo (16.4) ke pemohon &
// Operational; tidak ada email ke perusahaan peminjam (keputusan user 2026-11-17). Perpanjangan disetujui → Operational.
import type { PrismaClient } from "@/generated/prisma/client";
import { dueLabel, formatLoanDuration, groupLoanItems, loanPurposeText } from "@/lib/demo-loan";
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

export async function buildDemoLoanEmails(db: PrismaClient, loanId: string, template: "loan-approved"): Promise<OutgoingEmail<DemoLoanEmailTemplate>[]> {
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
export async function enqueueDemoLoanEmails(db: PrismaClient, loanId: string, template: "loan-approved"): Promise<void> {
  try {
    await enqueueEmails(db, await buildDemoLoanEmails(db, loanId, template));
  } catch (error) {
    console.error("[mail] gagal menyusun email peminjaman", error);
  }
}

// ---------------------------------------------------------------------
// Pengingat jatuh tempo & perpanjangan (Tahap 16.4, 2026-11-18)
// ---------------------------------------------------------------------

const personName = (user: { email: string; employee: { fullName: string } | null }) => user.employee?.fullName ?? user.email;

/** Data peminjaman yang dibutuhkan email pengingat (dimuat job harian). */
export type DueLoan = {
  id: string;
  number: string;
  borrowerName: string;
  picName: string;
  picEmail: string;
  startDate: Date;
  dueDate: Date;
  deliveredAt: Date | null;
  requester: { email: string; isActive: boolean; employee: { fullName: string } | null };
  salesPerson: { fullName: string };
  items: { deviceName: string; serialNo: string }[];
};

function dueDetails(loan: DueLoan): string[] {
  return [
    `PIC peminjam: ${loan.picName} (${loan.picEmail})`,
    ...(loan.deliveredAt ? [`Diantar: ${formatDate(loan.deliveredAt)}`] : []),
    `Jatuh tempo: ${formatDate(loan.dueDate)} (periode ${formatLoanDuration(toJakartaIsoDate(loan.startDate), toJakartaIsoDate(loan.dueDate))})`,
    `Sales Person: ${loan.salesPerson.fullName}`,
    ...groupLoanItems(loan.items).map((group) => `${group.deviceName} ×${group.serials.length} — SN ${group.serials.join(", ")}`),
  ];
}

/**
 * Email pengingat satu peminjaman: ke pemohon (bila masih aktif) & Operational (belum diatur → Admin). Balasan pemohon
 * diarahkan ke Operational, balasan Operational ke pemohon — supaya keduanya bisa langsung berkoordinasi.
 * Perusahaan peminjam (PIC) TIDAK dikirimi (keputusan user 2026-11-17).
 */
export function buildLoanDueEmails(
  loan: DueLoan,
  operational: { email: string; employee: { fullName: string } | null }[],
  daysLeft: number,
): OutgoingEmail<"loan-due-soon" | "loan-overdue">[] {
  const overdue = daysLeft < 0;
  const template: "loan-due-soon" | "loan-overdue" = overdue ? "loan-overdue" : "loan-due-soon";
  const when = dueLabel(daysLeft);
  const heading = overdue ? `Peminjaman unit ${when}` : `Peminjaman unit jatuh tempo ${when}`;
  const subject = overdue
    ? `[Terlambat] Peminjaman ${loan.number} (${loan.borrowerName}) ${when}`
    : `[Pengingat] Peminjaman ${loan.number} (${loan.borrowerName}) jatuh tempo ${when}`;
  const requesterName = personName(loan.requester);
  const operationalEmails = operational.map((user) => user.email);
  const operationalNames = operational.map(personName).join(", ");
  const base = { template, requesterName, borrowerName: loan.borrowerName, number: loan.number, heading, details: dueDetails(loan), url: appUrl(`/inventory/peminjaman/${loan.id}`) };

  const emails: OutgoingEmail<"loan-due-soon" | "loan-overdue">[] = [];
  const seen = new Set<string>();
  if (loan.requester.isActive) {
    seen.add(loan.requester.email);
    emails.push({
      to: loan.requester.email,
      subject,
      template,
      replyTo: operationalEmails.filter((email) => email !== loan.requester.email),
      props: {
        ...base,
        recipientName: requesterName,
        statusLine: overdue
          ? "Barang belum kembali. Hubungi peminjam untuk mengatur pengembalian, atau ajukan perpanjangan di halaman peminjaman bila unit masih dipakai."
          : "Hubungi peminjam untuk mengatur pengembalian barang, atau ajukan perpanjangan di halaman peminjaman bila unit masih dipakai.",
        replyTo: operationalNames ? `Operational (${operationalNames})` : undefined,
      },
    });
  }
  for (const user of operational) {
    if (seen.has(user.email)) continue;
    seen.add(user.email);
    emails.push({
      to: user.email,
      subject,
      template,
      replyTo: loan.requester.isActive && loan.requester.email !== user.email ? [loan.requester.email] : [],
      props: {
        ...base,
        recipientName: personName(user),
        statusLine: overdue
          ? "Barang belum kembali dari peminjam. Koordinasikan dengan pemohon; setelah barang tiba, cek lalu catat lewat Terima Pengembalian."
          : "Siapkan penerimaan barang. Setelah barang tiba, cek lalu catat lewat Terima Pengembalian.",
        replyTo: loan.requester.isActive && loan.requester.email !== user.email ? `pemohon (${requesterName})` : undefined,
      },
    });
  }
  // Tanpa tujuan balasan → footer "mohon tidak membalas".
  return emails.map((email) => (email.replyTo?.length ? email : { ...email, replyTo: undefined, props: { ...email.props, replyTo: undefined } }));
}

/** Perpanjangan disetujui final → Operational diberi tahu jatuh tempo baru (pemohon mendapat email approval biasa). */
export async function enqueueLoanExtendedEmails(db: PrismaClient, extensionId: string): Promise<void> {
  try {
    const extension = await db.demoLoanExtension.findUnique({
      where: { id: extensionId },
      include: {
        loan: {
          include: {
            requester: { select: { email: true, isActive: true, employee: { select: { fullName: true } } } },
            salesPerson: { select: { fullName: true } },
            items: { select: { deviceName: true, serialNo: true }, orderBy: { id: "asc" } },
          },
        },
      },
    });
    if (extension?.status !== "APPROVED") return;
    const loan = extension.loan;
    const recipients = await operationalRecipients(db);
    const statusLine = `Jatuh tempo diperpanjang dari ${formatDate(extension.previousDueDate)} menjadi ${formatDate(extension.newDueDate)}. Alasan: ${extension.reason}`;
    await enqueueEmails(
      db,
      recipients.map((recipient) => ({
        to: recipient.email,
        subject: `[Diperpanjang] Peminjaman ${loan.number} (${loan.borrowerName}) s/d ${formatDate(extension.newDueDate, "short")}`,
        template: "loan-extended" as const,
        props: {
          template: "loan-extended" as const,
          recipientName: personName(recipient),
          requesterName: personName(loan.requester),
          borrowerName: loan.borrowerName,
          number: loan.number,
          statusLine,
          details: dueDetails(loan),
          url: appUrl(`/inventory/peminjaman/${loan.id}`),
        },
      })),
    );
  } catch (error) {
    console.error("[mail] gagal menyusun email perpanjangan", error);
  }
}
