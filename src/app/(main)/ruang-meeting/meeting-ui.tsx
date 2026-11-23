// Potongan tampilan bersama halaman Ruang Meeting (Fase 17): tab, warna per ruang, satu baris booking.
import { Pencil } from "lucide-react";
import { LinkTabs } from "@/components/shared/link-tabs";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { bookingRights, type MeetingHours, timeRangeLabel } from "@/lib/meeting-room";
import type { CalendarBooking } from "@/lib/services/meeting-room-queries";
import { cn } from "@/lib/utils";
import { BookingDialog } from "./booking-dialog";
import { CancelBookingButton } from "./cancel-booking-button";

export function MeetingTabs({ active }: { active: "kalender" | "saya" }) {
  return (
    <LinkTabs
      label="Ruang Meeting"
      active={active}
      tabs={[
        { key: "kalender", label: "Kalender", href: "/ruang-meeting" },
        { key: "saya", label: "Booking Saya", href: "/ruang-meeting/saya" },
      ]}
    />
  );
}

/** Warna per ruang (ganjil biru, genap oranye) — dipakai chip kalender, titik HP, dan legenda. */
export function roomTone(roomNumber: number) {
  return roomNumber % 2 === 1
    ? { chip: "bg-brand-soft text-brand-deep", dot: "bg-brand", ring: "shadow-[inset_3px_0_0_var(--brand)]" }
    : { chip: "bg-amber-soft text-amber-ink", dot: "bg-amber", ring: "shadow-[inset_3px_0_0_var(--amber)]" };
}

/** "R1" untuk chip kalender yang sempit. */
export function roomShort(roomNumber: number) {
  return `R${roomNumber}`;
}

export const weekdayDate = (iso: string) => formatDate(`${iso}T00:00:00Z`, "weekday");

export type BookingViewer = { id: string; isAdmin: boolean };

export type BookingFormContext = {
  rooms: { id: string; name: string }[];
  hours: MeetingHours;
  minDate: string;
  maxDate: string;
};

/**
 * Satu booking: jam, ruang, agenda, pemesan + aksi Ubah (pemilik, satu kali, sebelum mulai) dan Batal. `showDate` untuk
 * daftar lintas tanggal (Booking Saya); `showOwner` untuk kalender (semua orang melihat siapa pemesannya).
 */
export function BookingItem({
  booking,
  viewer,
  now,
  form,
  showDate = false,
  showOwner = true,
  status,
}: {
  booking: CalendarBooking;
  viewer: BookingViewer;
  now: Date;
  form: BookingFormContext;
  showDate?: boolean;
  showOwner?: boolean;
  /** Riwayat (Booking Saya): label status menggantikan aksi. */
  status?: React.ReactNode;
}) {
  const rights = bookingRights(booking, viewer, now);
  const range = timeRangeLabel(booking.start, booking.end);
  const summary = `${booking.roomName}, ${weekdayDate(booking.date)} ${range}`;
  const tone = roomTone(booking.roomNumber);
  return (
    <li className={cn("flex flex-col gap-2 rounded-[16px] bg-white px-4 py-3 shadow-[inset_0_0_0_1px_var(--line)]", tone.ring)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 space-y-0.5">
          {showDate && <p className="text-[13px] font-semibold text-ink-3 first-letter:uppercase">{weekdayDate(booking.date)}</p>}
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
            <span className="font-mono tabular-nums">{range}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", tone.chip)}>{booking.roomName}</span>
            {rights.isOwner && !status && <StatusBadge variant="info">Milik Anda</StatusBadge>}
            {booking.edited && <StatusBadge variant="neutral">Sudah diubah</StatusBadge>}
          </p>
          <p className="text-sm break-words text-ink-2">{booking.agenda}</p>
          {showOwner && <p className="text-[13px] text-ink-3">Pemesan: {booking.ownerName}</p>}
        </div>
        {status ??
          ((rights.canEdit || rights.canCancel) && (
            <div className="flex flex-wrap gap-1">
              {rights.canEdit && (
                <BookingDialog
                  trigger={
                    <Button variant="ghost" size="sm" aria-label={`Ubah booking ${summary}`}>
                      <Pencil aria-hidden /> Ubah
                    </Button>
                  }
                  {...form}
                  bookingId={booking.id}
                  defaults={{ roomId: booking.roomId, date: booking.date, start: booking.start, end: booking.end, agenda: booking.agenda }}
                />
              )}
              {rights.canCancel && <CancelBookingButton bookingId={booking.id} summary={summary} needsReason={rights.needsReason} />}
            </div>
          ))}
      </div>
    </li>
  );
}
