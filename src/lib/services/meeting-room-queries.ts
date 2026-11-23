// Query tampilan booking ruang meeting (Fase 17, 2026-11-23): daftar ruang, kalender bulanan, Booking Saya.
// Semua karyawan melihat semua booking (tanggal, jam, ruang, pemesan, agenda).
import type { PrismaClient } from "@/generated/prisma/client";
import { jakartaDateTime } from "@/lib/attendance";
import { fromIsoDate, formatTime, toJakartaIsoDate } from "@/lib/format";
import { addDays } from "@/lib/leave";

export type MeetingRoomView = { id: string; number: number; name: string; isActive: boolean };

export async function listMeetingRooms(db: PrismaClient, { activeOnly = false }: { activeOnly?: boolean } = {}): Promise<MeetingRoomView[]> {
  return db.meetingRoom.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    select: { id: true, number: true, name: true, isActive: true },
    orderBy: { number: "asc" },
  });
}

/** Jumlah booking aktif yang belum selesai per ruang (Setting: alasan ruang belum bisa dinonaktifkan). */
export async function countUpcomingBookingsByRoom(db: PrismaClient, now = new Date()): Promise<Map<string, number>> {
  const rows = await db.meetingBooking.groupBy({ by: ["roomId"], where: { status: "ACTIVE", endAt: { gt: now } }, _count: { _all: true } });
  return new Map(rows.map((row) => [row.roomId, row._count._all]));
}

/** Booking aktif di kalender. Waktu sudah dalam string (aman dikirim ke Client Component). */
export type CalendarBooking = {
  id: string;
  roomId: string;
  roomNumber: number;
  roomName: string;
  date: string;
  start: string;
  end: string;
  agenda: string;
  userId: string;
  ownerName: string;
  /** Jatah ubah satu kali sudah dipakai. */
  edited: boolean;
  /** ISO, untuk menentukan aksi (sudah mulai / sudah selesai). */
  startAt: string;
  endAt: string;
};

export type MeetingCalendarDay = {
  date: string;
  inMonth: boolean;
  weekend: boolean;
  holiday: string | null;
  bookings: CalendarBooking[];
};

const bookingInclude = {
  room: { select: { number: true, name: true } },
  user: { select: { email: true, employee: { select: { fullName: true } } } },
} as const;

type BookingRow = {
  id: string;
  roomId: string;
  userId: string;
  agenda: string;
  startAt: Date;
  endAt: Date;
  editedAt: Date | null;
  room: { number: number; name: string };
  user: { email: string; employee: { fullName: string } | null };
};

function toCalendarBooking(row: BookingRow): CalendarBooking {
  return {
    id: row.id,
    roomId: row.roomId,
    roomNumber: row.room.number,
    roomName: row.room.name,
    date: toJakartaIsoDate(row.startAt),
    start: formatTime(row.startAt),
    end: formatTime(row.endAt),
    agenda: row.agenda,
    userId: row.userId,
    ownerName: row.user.employee?.fullName ?? row.user.email,
    edited: row.editedAt !== null,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
  };
}

/**
 * Kalender bulanan: grid Senin–Minggu (termasuk hari dari bulan sebelum/sesudah untuk melengkapi minggu, sama seperti
 * `getLeaveCalendar`), tiap hari berisi nama libur dan booking aktif urut jam lalu nomor ruang. Satu query booking
 * (index `startAt`) — booking selalu di dalam satu hari, jadi cukup disaring dari jam mulainya.
 */
export async function getMeetingCalendar(db: PrismaClient, yearMonth: string): Promise<MeetingCalendarDay[][]> {
  const [y, m] = yearMonth.split("-").map(Number);
  const first = `${yearMonth}-01`;
  const last = toJakartaIsoDate(new Date(Date.UTC(y, m, 0)));
  const firstWeekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Senin
  const lastWeekday = (new Date(`${last}T00:00:00Z`).getUTCDay() + 6) % 7;
  const gridStart = addDays(first, -firstWeekday);
  const gridEnd = addDays(last, 6 - lastWeekday);

  const [bookings, holidays] = await Promise.all([
    db.meetingBooking.findMany({
      where: {
        status: "ACTIVE",
        startAt: { gte: jakartaDateTime(gridStart, "00:00"), lt: jakartaDateTime(addDays(gridEnd, 1), "00:00") },
      },
      include: bookingInclude,
      orderBy: [{ startAt: "asc" }, { room: { number: "asc" } }],
    }),
    db.holiday.findMany({ where: { deletedAt: null, date: { gte: fromIsoDate(gridStart), lte: fromIsoDate(gridEnd) } } }),
  ]);
  const holidayOf = new Map(holidays.map((h) => [toJakartaIsoDate(h.date), h.name]));
  const bookingsOf = new Map<string, CalendarBooking[]>();
  for (const row of bookings) {
    const booking = toCalendarBooking(row);
    bookingsOf.set(booking.date, [...(bookingsOf.get(booking.date) ?? []), booking]);
  }

  const weeks: MeetingCalendarDay[][] = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    if ((weeks.at(-1)?.length ?? 7) === 7) weeks.push([]);
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    weeks.at(-1)!.push({
      date: day,
      inMonth: day.startsWith(yearMonth),
      weekend: weekday === 0 || weekday === 6,
      holiday: holidayOf.get(day) ?? null,
      bookings: bookingsOf.get(day) ?? [],
    });
  }
  return weeks;
}

export type MyBookingView = CalendarBooking & {
  status: "ACTIVE" | "CANCELLED";
  cancelReason: string | null;
  /** Nama yang membatalkan bila bukan pemiliknya sendiri (mis. Admin). */
  cancelledByOther: string | null;
};

/** Booking Saya: mendatang (aktif, belum selesai) dan riwayat 30 hari terakhir (sudah selesai atau dibatalkan). */
export async function listMyBookings(db: PrismaClient, userId: string, now = new Date()) {
  const historyFrom = jakartaDateTime(addDays(toJakartaIsoDate(now), -30), "00:00");
  const rows = await db.meetingBooking.findMany({
    where: {
      userId,
      OR: [
        { status: "ACTIVE", endAt: { gt: now } },
        { startAt: { gte: historyFrom }, OR: [{ status: "CANCELLED" }, { endAt: { lte: now } }] },
      ],
    },
    include: { ...bookingInclude, cancelledBy: { select: { email: true, employee: { select: { fullName: true } } } } },
    orderBy: { startAt: "asc" },
    take: 200,
  });
  const views: MyBookingView[] = rows.map((row) => ({
    ...toCalendarBooking(row),
    status: row.status,
    cancelReason: row.cancelReason,
    cancelledByOther:
      row.cancelledBy && row.cancelledById !== row.userId ? (row.cancelledBy.employee?.fullName ?? row.cancelledBy.email) : null,
  }));
  return {
    upcoming: views.filter((b) => b.status === "ACTIVE" && new Date(b.endAt) > now),
    history: views.filter((b) => !(b.status === "ACTIVE" && new Date(b.endAt) > now)).reverse(),
  };
}
