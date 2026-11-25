// Email peminjaman unit demo khusus Operational (Fase 16, 2026-11-17). Pengajuan, persetujuan, dan penolakan memakai
// email approval engine (approval-emails.ts: ke Ko Yosep & pemohon). Di sini: setelah disetujui final → Operational aktif
// diminta menyiapkan barang & mencetak form. Pengingat jatuh tempo (16.4) ke pemohon & Operational; tidak ada email ke
// perusahaan peminjam (keputusan user 2026-11-17). Perpanjangan disetujui → Operational.
// Sejak 2026-11-19 Admin TIDAK menggantikan Operational: bila belum ada Operational, Admin hanya mendapat peringatan
// untuk menunjuknya (email "siapkan barang" berubah menjadi peringatan), pengingat jatuh tempo hanya ke pemohon.
import type { PrismaClient } from "@/generated/prisma/client";
import {
  daysBetween,
  dueLabel,
  FOLLOW_UP_REPEAT_DAYS,
  formatLoanDuration,
  groupLoanItems,
  loanItemGroupText,
  isProblemCondition,
  loanPurposeText,
  RETURN_CONDITION_LABEL,
  snSuffix,
} from "@/lib/demo-loan";
import { formatDate, toJakartaIsoDate } from "@/lib/format";
import { getOperationalUserIds } from "@/lib/services/inventory-access";
import type { DemoLoanEmailTemplate } from "./templates/demo-loan-email";
import { appUrl } from "./app-url";
import { enqueueEmails, type OutgoingEmail } from "./queue";

const recipientSelect = { id: true, email: true, employee: { select: { fullName: true } } } as const;

/** Operational aktif (yang ditunjuk di Setting → Inventaris & Rak). Kosong bila belum diatur — Admin tidak menggantikan. */
export async function operationalRecipients(db: PrismaClient) {
  return db.user.findMany({ where: { id: { in: await getOperationalUserIds(db) }, isActive: true }, select: recipientSelect });
}

/**
 * Disetujui final → Operational diminta menyiapkan barang. Belum ada Operational aktif → Admin aktif mendapat peringatan
 * untuk menunjuk Operational (bukan diminta menyiapkan barang).
 */
export async function buildDemoLoanEmails(db: PrismaClient, loanId: string, template: "loan-approved"): Promise<OutgoingEmail<DemoLoanEmailTemplate>[]> {
  const loan = await db.demoLoan.findUniqueOrThrow({
    where: { id: loanId },
    include: {
      requester: { select: { email: true, employee: { select: { fullName: true } } } },
      pic: { select: { fullName: true } },
      items: { select: { deviceName: true, serialNo: true }, orderBy: { id: "asc" } },
    },
  });
  const requesterName = loan.requester.employee?.fullName ?? loan.requester.email;
  const details = [
    `Kegunaan: ${loanPurposeText(loan.purpose, loan.purposeDetail)}`,
    `Periode: ${formatDate(loan.startDate, "short")} – ${formatDate(loan.dueDate, "short")} (${formatLoanDuration(toJakartaIsoDate(loan.startDate), toJakartaIsoDate(loan.dueDate))})`,
    `Kontak peminjam: ${loan.contactName} (${loan.contactEmail})`,
    `PIC: ${loan.pic.fullName}`,
    ...groupLoanItems(loan.items).map(loanItemGroupText),
    ...(loan.remarks ? [`Keperluan: ${loan.remarks}`] : []),
  ];
  const operational = await operationalRecipients(db);
  const noOperational = operational.length === 0;
  const recipients = noOperational ? await db.user.findMany({ where: { role: "ADMIN", isActive: true }, select: recipientSelect }) : operational;
  return recipients.map((recipient) => ({
    to: recipient.email,
    subject: noOperational
      ? `[Peminjaman Unit] Belum ada Operational untuk ${loan.number} — ${loan.borrowerName}`
      : `[Peminjaman Unit] Siapkan ${loan.number} — ${loan.borrowerName}`,
    template,
    props: {
      template,
      recipientName: recipient.employee?.fullName ?? recipient.email,
      requesterName,
      borrowerName: loan.borrowerName,
      number: loan.number,
      ...(noOperational ? { heading: "Peminjaman disetujui, belum ada Operational" } : {}),
      statusLine: noOperational
        ? "Sudah disetujui, tetapi belum ada Operational yang bisa menyiapkan barang. Tunjuk Operational di Setting → Inventaris & Rak."
        : "Sudah disetujui. Siapkan barang di posisi rak yang tertera, pilih Item Sender, lalu cetak Product Trial Form.",
      details,
      url: appUrl(noOperational ? "/setting/inventaris" : `/inventory/peminjaman/${loan.id}`),
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
  contactName: string;
  contactEmail: string;
  startDate: Date;
  dueDate: Date;
  deliveredAt: Date | null;
  requester: { email: string; isActive: boolean; employee: { fullName: string } | null };
  pic: { fullName: string };
  items: { deviceName: string; serialNo: string | null }[];
};

function dueDetails(loan: DueLoan): string[] {
  return [
    `Kontak peminjam: ${loan.contactName} (${loan.contactEmail})`,
    ...(loan.deliveredAt ? [`Diantar: ${formatDate(loan.deliveredAt)}`] : []),
    `Jatuh tempo: ${formatDate(loan.dueDate)} (periode ${formatLoanDuration(toJakartaIsoDate(loan.startDate), toJakartaIsoDate(loan.dueDate))})`,
    `PIC: ${loan.pic.fullName}`,
    ...groupLoanItems(loan.items).map(loanItemGroupText),
  ];
}

/**
 * Email pengingat satu peminjaman: ke pemohon (bila masih aktif) & Operational aktif (Admin tidak menggantikan,
 * 2026-11-19). Balasan pemohon diarahkan ke Operational, balasan Operational ke pemohon — supaya keduanya bisa langsung
 * berkoordinasi. Perusahaan peminjam (kontak "up:") TIDAK dikirimi (keputusan user 2026-11-17).
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
          ? "Barang belum kembali dari peminjam. Koordinasikan dengan pemohon, lalu jadwalkan pengambilan (HAF terbit untuk dibawa kurir); setelah barang tiba, isi Pengecekan Unit."
          : "Siapkan pengambilan barang: jadwalkan pengambilan (HAF terbit untuk dibawa kurir), lalu isi Pengecekan Unit setelah barang tiba.",
        replyTo: loan.requester.isActive && loan.requester.email !== user.email ? `pemohon (${requesterName})` : undefined,
      },
    });
  }
  // Tanpa tujuan balasan → footer "mohon tidak membalas".
  return emails.map((email) => (email.replyTo?.length ? email : { ...email, replyTo: undefined, props: { ...email.props, replyTo: undefined } }));
}

// ---------------------------------------------------------------------
// Tindak lanjut unit Rusak / Tidak lengkap (2026-11-20)
// ---------------------------------------------------------------------

/**
 * Email tindak lanjut satu peminjaman (status Perlu Tindak Lanjut): ke PIC internal AMI (akun aktif milik karyawan PIC)
 * & Operational aktif, berisi unit yang rusak / tidak lengkap beserta catatannya. Pertama kali saat pengecekan disimpan;
 * selama belum selesai diulang tiap 7 hari (job harian). Balasan PIC diarahkan ke Operational dan sebaliknya.
 */
export async function buildLoanFollowUpEmails(db: PrismaClient, loanId: string, todayIso = toJakartaIsoDate()): Promise<OutgoingEmail<"loan-follow-up">[]> {
  const loan = await db.demoLoan.findUnique({
    where: { id: loanId },
    include: {
      requester: { select: { email: true, employee: { select: { fullName: true } } } },
      pic: { select: { fullName: true } },
      receivedBy: { select: { email: true, employee: { select: { fullName: true } } } },
      items: { orderBy: { id: "asc" } },
    },
  });
  if (loan?.status !== "FOLLOW_UP") return [];
  const problems = loan.items.filter((item) => isProblemCondition(item.returnCondition) && !item.resolvedCondition);
  const returnedIso = loan.returnedAt ? toJakartaIsoDate(loan.returnedAt) : todayIso;
  const days = daysBetween(returnedIso, todayIso);
  const reminder = days >= FOLLOW_UP_REPEAT_DAYS;
  const details = [
    `Peminjam: ${loan.borrowerName} (up: ${loan.contactName}, ${loan.contactEmail})`,
    ...(loan.hafNumber ? [`Hardware Admission Form: ${loan.hafNumber}`] : []),
    `Tiba & dicek: ${formatDate(`${returnedIso}T00:00:00Z`)}${loan.receivedBy ? ` oleh ${personName(loan.receivedBy)}` : ""}`,
    ...problems.map((item) => `${item.deviceName}${snSuffix(item.serialNo)} — ${RETURN_CONDITION_LABEL[item.returnCondition!]}: ${item.returnNote ?? "-"}`),
    ...(loan.returnNote ? [`Catatan pengembalian: ${loan.returnNote}`] : []),
    `PIC: ${loan.pic.fullName}`,
  ];
  const subject = reminder
    ? `[Pengingat Tindak Lanjut] Peminjaman ${loan.number} (${loan.borrowerName}) belum selesai — ${days} hari`
    : `[Tindak Lanjut] Peminjaman ${loan.number} (${loan.borrowerName}) — ${problems.length} unit rusak / tidak lengkap`;
  const heading = reminder ? `Tindak lanjut belum selesai (${days} hari)` : undefined;

  const [pics, operational] = await Promise.all([
    db.user.findMany({ where: { employeeId: loan.picId, isActive: true }, select: recipientSelect }),
    operationalRecipients(db),
  ]);
  const picEmails = pics.map((user) => user.email);
  const operationalEmails = operational.map((user) => user.email);
  const base = {
    template: "loan-follow-up" as const,
    requesterName: personName(loan.requester),
    borrowerName: loan.borrowerName,
    number: loan.number,
    heading,
    details,
    url: appUrl(`/inventory/peminjaman/${loan.id}`),
  };
  const emails: OutgoingEmail<"loan-follow-up">[] = [];
  const seen = new Set<string>();
  for (const user of pics) {
    if (seen.has(user.email)) continue;
    seen.add(user.email);
    const replyTo = operationalEmails.filter((email) => email !== user.email);
    emails.push({
      to: user.email,
      subject,
      template: "loan-follow-up",
      replyTo,
      props: {
        ...base,
        recipientName: personName(user),
        statusLine: "Anda PIC peminjaman ini. Bantu tindak lanjuti dengan peminjam (kelengkapan yang kurang / perbaikan); Operational menutup tindak lanjut setelah beres.",
        replyTo: replyTo.length ? `Operational (${operational.map(personName).join(", ")})` : undefined,
      },
    });
  }
  for (const user of operational) {
    if (seen.has(user.email)) continue;
    seen.add(user.email);
    const replyTo = picEmails.filter((email) => email !== user.email);
    emails.push({
      to: user.email,
      subject,
      template: "loan-follow-up",
      replyTo,
      props: {
        ...base,
        recipientName: personName(user),
        statusLine: "Tindak lanjuti bersama PIC. Setelah beres, tekan Selesaikan Tindak Lanjut di halaman peminjaman — hasilnya lalu diverifikasi engineer; unit tertahan sampai verifikasi disetujui.",
        replyTo: replyTo.length ? `PIC (${loan.pic.fullName})` : undefined,
      },
    });
  }
  // Tanpa tujuan balasan → footer "mohon tidak membalas".
  return emails.map((email) => (email.replyTo?.length ? email : { ...email, replyTo: undefined }));
}

/** Kirim email tindak lanjut pertama (setelah pengecekan disimpan). Gagal menyusun email tidak menggagalkan aksi user. */
export async function enqueueLoanFollowUpEmails(db: PrismaClient, loanId: string): Promise<void> {
  try {
    await enqueueEmails(db, await buildLoanFollowUpEmails(db, loanId));
  } catch (error) {
    console.error("[mail] gagal menyusun email tindak lanjut", error);
  }
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
            pic: { select: { fullName: true } },
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
