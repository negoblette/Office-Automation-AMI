// Pengingat jatuh tempo peminjaman unit (Tahap 16.4, 2026-11-18). Dipanggil worker setiap hari 07:00 WIB (job
// `reminder.demo-loan`). Untuk peminjaman yang barangnya sedang dipinjam (ON_LOAN): H-7, H-1 / hari H, lalu terlambat
// (H+1) dan tiap 7 hari selama belum kembali (lib/demo-loan.ts#dueReminderStage). Email ke pemohon & Operational saja.
//
// Anti-dobel: setiap tahap dicatat dulu di DemoLoanReminder (unik per peminjaman + jatuh tempo + tahap) dengan
// INSERT … ON CONFLICT DO NOTHING; hanya baris yang benar-benar baru dibuatkan email, jadi dua job yang berjalan
// bersamaan tidak mengirim email yang sama. Jatuh tempo diperpanjang → tanggal baru → tahap dimulai lagi.
import type { PrismaClient } from "@/generated/prisma/client";
import { addDaysIso, daysUntilDue, DUE_SOON_DAYS, dueReminderStage } from "@/lib/demo-loan";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { buildLoanDueEmails, operationalRecipients } from "@/lib/mail/demo-loan-emails";
import type { OutgoingEmail } from "@/lib/mail/queue";

const iso = (date: Date) => toJakartaIsoDate(date);

export async function loanDueReminders(db: PrismaClient, todayIso = toJakartaIsoDate()): Promise<OutgoingEmail[]> {
  const loans = await db.demoLoan.findMany({
    where: { status: "ON_LOAN", dueDate: { lte: fromIsoDate(addDaysIso(todayIso, DUE_SOON_DAYS)) } },
    orderBy: { dueDate: "asc" },
    select: {
      id: true,
      number: true,
      borrowerName: true,
      picName: true,
      picEmail: true,
      startDate: true,
      dueDate: true,
      deliveredAt: true,
      requester: { select: { email: true, isActive: true, employee: { select: { fullName: true } } } },
      salesPerson: { select: { fullName: true } },
      items: { select: { deviceName: true, serialNo: true }, orderBy: { id: "asc" } },
    },
  });
  const due = loans
    .map((loan) => ({ loan, stage: dueReminderStage(iso(loan.startDate), iso(loan.dueDate), todayIso) }))
    .filter((entry): entry is { loan: (typeof loans)[number]; stage: number } => entry.stage !== null);
  if (due.length === 0) return [];

  const claimed = await db.demoLoanReminder.createManyAndReturn({
    data: due.map(({ loan, stage }) => ({ loanId: loan.id, dueDate: loan.dueDate, stage })),
    skipDuplicates: true,
    select: { loanId: true },
  });
  if (claimed.length === 0) return [];
  const fresh = new Set(claimed.map((row) => row.loanId));
  const operational = await operationalRecipients(db);
  return due
    .filter(({ loan }) => fresh.has(loan.id))
    .flatMap(({ loan }) => buildLoanDueEmails(loan, operational, daysUntilDue(iso(loan.dueDate), todayIso)));
}
