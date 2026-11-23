// Email konfirmasi booking ruang meeting (Fase 17, 2026-11-23) ke pemesan: dibuat, diubah, dibatalkan.
// Disusun dari hasil service lalu di-enqueue SETELAH transaksi commit (`enqueueEmails`).
import { formatDate } from "@/lib/format";
import { timeRangeLabel } from "@/lib/meeting-room";
import type { BookingMailInfo, MeetingBookingEvent } from "@/lib/services/meeting-room";
import { appUrl } from "./app-url";
import type { OutgoingEmail } from "./queue";
import type { MeetingBookingSchedule } from "./templates/meeting-booking-email";

const TEMPLATE = { CREATED: "meeting-booked", UPDATED: "meeting-updated", CANCELLED: "meeting-cancelled" } as const;
const SUBJECT_LABEL = { CREATED: "Booking dikonfirmasi", UPDATED: "Booking diubah", CANCELLED: "Booking dibatalkan" } as const;

function schedule(info: BookingMailInfo): MeetingBookingSchedule {
  return {
    roomName: info.roomName,
    dateLabel: formatDate(`${info.date}T00:00:00Z`, "weekday"),
    timeLabel: `${timeRangeLabel(info.start, info.end)} WIB`,
  };
}

export function buildMeetingBookingEmail(event: MeetingBookingEvent): OutgoingEmail<"meeting-booked" | "meeting-updated" | "meeting-cancelled"> {
  const { booking } = event;
  const shortDate = formatDate(`${booking.date}T00:00:00Z`, "short");
  return {
    to: booking.ownerEmail,
    subject: `[Ruang Meeting] ${SUBJECT_LABEL[event.kind]} — ${booking.roomName}, ${shortDate} ${timeRangeLabel(booking.start, booking.end)}`,
    template: TEMPLATE[event.kind],
    props: {
      kind: event.kind,
      recipientName: booking.ownerName,
      agenda: booking.agenda,
      ...schedule(booking),
      previous: event.kind === "UPDATED" ? schedule(event.previous) : undefined,
      cancelledBy: event.kind === "CANCELLED" ? event.cancelledByName : undefined,
      reason: event.kind === "CANCELLED" ? event.reason : undefined,
      url: appUrl(event.kind === "CANCELLED" ? `/ruang-meeting?bulan=${booking.date.slice(0, 7)}&tanggal=${booking.date}` : "/ruang-meeting/saya"),
    },
  };
}
