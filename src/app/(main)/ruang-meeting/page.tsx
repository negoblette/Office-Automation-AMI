import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { toJakartaIsoDate } from "@/lib/format";
import {
  DAY_BLOCK_LABEL,
  dayBlock,
  freeRanges,
  lastBookableDate,
  type MeetingHours,
  nextSlotTime,
  timeRangeLabel,
} from "@/lib/meeting-room";
import { getMeetingHours } from "@/lib/services/meeting-room";
import { getMeetingCalendar, listMeetingRooms, type MeetingCalendarDay, type MeetingRoomView } from "@/lib/services/meeting-room-queries";
import { BookingDialog } from "./booking-dialog";
import { MeetingCalendar } from "./meeting-calendar";
import { BookingItem, type BookingFormContext, type BookingViewer, MeetingTabs, weekdayDate } from "./meeting-ui";

export const metadata: Metadata = { title: "Ruang Meeting" };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Bulan & tanggal terpilih dari `?bulan=YYYY-MM&tanggal=YYYY-MM-DD`; tanggal selalu di dalam bulan yang tampil. */
function resolveSelection(params: { bulan?: string; tanggal?: string }, todayIso: string) {
  const month = params.bulan && MONTH_RE.test(params.bulan) ? params.bulan : null;
  const date = params.tanggal && DATE_RE.test(params.tanggal) ? params.tanggal : null;
  if (month) {
    const selected = date?.startsWith(month) ? date : month === todayIso.slice(0, 7) ? todayIso : `${month}-01`;
    return { yearMonth: month, selected };
  }
  if (date) return { yearMonth: date.slice(0, 7), selected: date };
  return { yearMonth: todayIso.slice(0, 7), selected: todayIso };
}

export default async function RuangMeetingPage({ searchParams }: { searchParams: Promise<{ bulan?: string; tanggal?: string }> }) {
  const user = await requireUser();
  const now = new Date();
  const todayIso = toJakartaIsoDate(now);
  const { yearMonth, selected: requested } = resolveSelection(await searchParams, todayIso);
  const [weeks, allRooms, hours] = await Promise.all([getMeetingCalendar(prisma, yearMonth), listMeetingRooms(prisma), getMeetingHours(prisma)]);
  const activeRooms = allRooms.filter((room) => room.isActive);
  // Tanggal yang tidak ada (mis. 2026-02-31) → tanggal 1 bulan itu.
  const day = weeks.flat().find((d) => d.date === requested) ?? weeks.flat().find((d) => d.inMonth)!;
  const selected = day.date;
  const bookedRoomIds = new Set(weeks.flat().flatMap((d) => d.bookings.map((b) => b.roomId)));
  const legendRooms = allRooms.filter((room) => room.isActive || bookedRoomIds.has(room.id));

  const viewer: BookingViewer = { id: user.id, isAdmin: user.role === "ADMIN" };
  const form: BookingFormContext = {
    rooms: activeRooms.map((room) => ({ id: room.id, name: room.name })),
    hours,
    minDate: todayIso,
    maxDate: lastBookableDate(todayIso),
  };
  const selectedBookable = !dayBlock(selected, { todayIso, holiday: Boolean(day.holiday) }) && !isClosedToday(selected, todayIso, hours, now);
  const newBookingDefaults = (date: string) => ({ roomId: activeRooms[0]?.id ?? "", date, start: "", end: "", agenda: "" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ruang Meeting"
        description={`Booking ruang meeting tanpa approval — siapa cepat dia dapat. Senin–Jumat, ${hours.start}–${hours.end}.`}
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Ruang Meeting" }]}
        actions={
          activeRooms.length > 0 && (
            <BookingDialog
              trigger={
                <Button size="lg">
                  <Plus aria-hidden /> Booking Ruang
                </Button>
              }
              {...form}
              defaults={newBookingDefaults(selectedBookable ? selected : "")}
            />
          )
        }
      />
      <MeetingTabs active="kalender" />

      {activeRooms.length === 0 && (
        <EmptyState title="Belum ada ruang meeting yang beroperasi" description="Admin dapat menyalakan ruang di Setting → Ruang Meeting." />
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <MeetingCalendar weeks={weeks} yearMonth={yearMonth} todayIso={todayIso} selected={selected} rooms={legendRooms} />
        <DayPanel
          day={day}
          rooms={allRooms}
          hours={hours}
          todayIso={todayIso}
          now={now}
          viewer={viewer}
          form={form}
          bookingTrigger={
            selectedBookable && activeRooms.length > 0 ? (
              <BookingDialog
                trigger={
                  <Button variant="secondary" size="sm">
                    <Plus aria-hidden /> Booking di tanggal ini
                  </Button>
                }
                {...form}
                defaults={newBookingDefaults(selected)}
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}

/** Hari ini tetapi slot terakhir sudah lewat (mis. dibuka setelah 17:00). */
function isClosedToday(date: string, todayIso: string, hours: MeetingHours, now: Date) {
  return date === todayIso && nextSlotTime(now) >= hours.end;
}

/** Rincian satu hari: per ruang, booking (jam, agenda, pemesan, aksi) dan jam yang masih kosong. */
function DayPanel({
  day,
  rooms,
  hours,
  todayIso,
  now,
  viewer,
  form,
  bookingTrigger,
}: {
  day: MeetingCalendarDay;
  rooms: MeetingRoomView[];
  hours: MeetingHours;
  todayIso: string;
  now: Date;
  viewer: BookingViewer;
  form: BookingFormContext;
  bookingTrigger: React.ReactNode;
}) {
  const block = dayBlock(day.date, { todayIso, holiday: Boolean(day.holiday) });
  // Ruang yang tampil: yang aktif, atau yang punya booking di hari ini (riwayat ruang yang kini nonaktif).
  const shown = rooms.filter((room) => room.isActive || day.bookings.some((b) => b.roomId === room.id));
  return (
    <section id="hari-terpilih" className="panel-surface flex scroll-mt-24 flex-col gap-4 p-5 sm:p-6" aria-labelledby="judul-hari-terpilih">
      <div className="space-y-1">
        <h2 id="judul-hari-terpilih" className="text-lg font-extrabold tracking-[-0.02em] text-ink first-letter:uppercase">
          {weekdayDate(day.date)}
        </h2>
        {day.holiday && <p className="text-sm font-semibold text-danger">Libur: {day.holiday}</p>}
        {block && <p className="text-sm text-ink-3">{DAY_BLOCK_LABEL[block]}.</p>}
        {!block && isClosedToday(day.date, todayIso, hours, now) && (
          <p className="text-sm text-ink-3">Jam operasional ruang meeting hari ini sudah lewat.</p>
        )}
      </div>
      {bookingTrigger}
      {shown.map((room) => {
        const bookings = day.bookings.filter((b) => b.roomId === room.id);
        const free = !block && room.isActive ? freeRanges(hours, bookings, day.date === todayIso ? nextSlotTime(now) : undefined) : [];
        return (
          <div key={room.id} className="flex flex-col gap-2">
            <h3 className="text-[13px] font-bold tracking-[0.02em] text-ink-3 uppercase">
              {room.name}
              {!room.isActive && " (tidak beroperasi)"}
            </h3>
            {bookings.length === 0 ? (
              <p className="text-sm text-ink-3">Belum ada booking.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {bookings.map((booking) => (
                  <BookingItem key={booking.id} booking={booking} viewer={viewer} now={now} form={form} />
                ))}
              </ul>
            )}
            {!block && room.isActive && (
              <p className="text-[13px] text-ink-3">
                {free.length ? `Jam kosong: ${free.map((r) => timeRangeLabel(r.start, r.end)).join(", ")}` : "Tidak ada jam kosong lagi."}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
