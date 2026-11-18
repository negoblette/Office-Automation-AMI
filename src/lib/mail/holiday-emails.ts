// Email perubahan Kalender Libur (2026-11-18): satu email per sinkronisasi yang menerapkan perubahan, ke penerima
// notifikasi (Setting → Jatah Cuti; keputusan user: Ci Ika (HR) & Ko Rudy (Direktur); belum diatur → semua Admin aktif).
import type { PrismaClient } from "@/generated/prisma/client";
import { formatDate } from "@/lib/format";
import { holidayNotifyRecipients, type HolidayChangeView, listHolidayRuns } from "@/lib/services/holiday-sync";
import { appUrl } from "./app-url";
import type { OutgoingEmail } from "./queue";

const day = (iso: string) => formatDate(`${iso}T00:00:00Z`, "weekday");
const shortDay = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

export function holidayChangeLine(change: HolidayChangeView): string {
  switch (change.kind) {
    case "ADD":
      return `${day(change.date)} — ${change.name}: ditambahkan sebagai libur`;
    case "REMOVE":
      return `${day(change.date)} — ${change.name}: dihapus (tidak ada lagi di kalender libur nasional)`;
    case "RENAME":
      return `${day(change.date)} — nama diperbarui: "${change.previousName ?? ""}" → "${change.name}"`;
  }
}

export async function buildHolidayChangeEmails(db: PrismaClient, runId: string): Promise<OutgoingEmail<"holiday-change">[]> {
  const [run] = await listHolidayRuns(db, { runId });
  if (!run) return [];
  const changes = run.changes.map(holidayChangeLine);
  const affected = run.changes.flatMap((change) =>
    change.affected.map(
      (leave) =>
        `${leave.number} · ${leave.employeeName} · ${shortDay(leave.startDate)}${leave.endDate !== leave.startDate ? ` – ${shortDay(leave.endDate)}` : ""} — ${shortDay(change.date)}: ${leave.effect}`,
    ),
  );
  const leaveCount = new Set(run.changes.flatMap((change) => change.affected.map((leave) => leave.id))).size;
  const subject = `[Kalender Libur] ${changes.length} perubahan libur nasional${leaveCount ? ` · ${leaveCount} pengajuan cuti terdampak` : ""}`;
  const recipients = await holidayNotifyRecipients(db);
  return recipients.map((recipient) => ({
    to: recipient.email,
    subject,
    template: "holiday-change" as const,
    props: { recipientName: recipient.employee?.fullName ?? recipient.email, changes, affected, url: appUrl("/cuti/kalender#perubahan-libur") },
  }));
}
