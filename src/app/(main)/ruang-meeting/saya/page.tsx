import type { Metadata } from "next";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { toJakartaIsoDate } from "@/lib/format";
import { lastBookableDate } from "@/lib/meeting-room";
import { getMeetingHours } from "@/lib/services/meeting-room";
import { listMeetingRooms, listMyBookings, type MyBookingView } from "@/lib/services/meeting-room-queries";
import { BookingItem, type BookingFormContext, type BookingViewer, MeetingTabs } from "../meeting-ui";

export const metadata: Metadata = { title: "Booking Saya" };

function HistoryStatus({ booking }: { booking: MyBookingView }) {
  if (booking.status === "ACTIVE") return <StatusBadge variant="success">Selesai</StatusBadge>;
  return (
    <div className="flex max-w-xs flex-col items-end gap-1 text-right">
      <StatusBadge variant="danger">Dibatalkan</StatusBadge>
      {booking.cancelledByOther && <span className="text-[13px] text-ink-3">oleh {booking.cancelledByOther}</span>}
      {booking.cancelReason && <span className="text-[13px] break-words text-ink-3">Alasan: {booking.cancelReason}</span>}
    </div>
  );
}

export default async function BookingSayaPage() {
  const user = await requireUser();
  const now = new Date();
  const todayIso = toJakartaIsoDate(now);
  const [{ upcoming, history }, rooms, hours] = await Promise.all([
    listMyBookings(prisma, user.id, now),
    listMeetingRooms(prisma, { activeOnly: true }),
    getMeetingHours(prisma),
  ]);
  const viewer: BookingViewer = { id: user.id, isAdmin: user.role === "ADMIN" };
  const form: BookingFormContext = {
    rooms: rooms.map((room) => ({ id: room.id, name: room.name })),
    hours,
    minDate: todayIso,
    maxDate: lastBookableDate(todayIso),
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Booking Saya"
        description="Booking ruang meeting milik Anda. Setiap booking bisa diubah satu kali dan dibatalkan sebelum jam mulai."
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Ruang Meeting", href: "/ruang-meeting" }, { label: "Booking Saya" }]}
      />
      <MeetingTabs active="saya" />

      <section className="flex flex-col gap-3" aria-labelledby="booking-mendatang">
        <h2 id="booking-mendatang" className="text-base font-semibold">
          Mendatang
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState title="Belum ada booking mendatang" description="Booking ruang lewat tab Kalender." />
        ) : (
          <ul className="flex max-w-3xl flex-col gap-2">
            {upcoming.map((booking) => (
              <BookingItem key={booking.id} booking={booking} viewer={viewer} now={now} form={form} showDate showOwner={false} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="booking-riwayat">
        <div>
          <h2 id="booking-riwayat" className="text-base font-semibold">
            Riwayat 30 hari terakhir
          </h2>
          <p className="text-sm text-muted-foreground">Booking yang sudah selesai atau dibatalkan.</p>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada riwayat.</p>
        ) : (
          <ul className="flex max-w-3xl flex-col gap-2">
            {history.map((booking) => (
              <BookingItem
                key={booking.id}
                booking={booking}
                viewer={viewer}
                now={now}
                form={form}
                showDate
                showOwner={false}
                status={<HistoryStatus booking={booking} />}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
