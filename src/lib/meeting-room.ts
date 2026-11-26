// Booking ruang meeting (Fase 17, 2026-11-23) — aturan murni tanpa database, dipakai service (server) dan form/kalender
// (client). Jam `HH:MM` zona Asia/Jakarta; tanggal `YYYY-MM-DD`.
// Aturan (keputusan user 2026-11-23): Senin–Jumat & bukan tanggal Kalender Libur, di dalam jam operasional (Setting,
// default 08:30–17:30), kelipatan 30 menit, paling jauh 30 hari ke depan, tidak boleh jam yang sudah lewat.
// Maks 10 booking aktif (belum selesai) per orang, Admin tidak dibatasi (audit keamanan 2026-11-26, F7).
import { jakartaDateTime, timeToMinutes } from "@/lib/attendance";
import { toJakartaIsoDate } from "@/lib/format";
import { addDays } from "@/lib/leave";

export type MeetingHours = { start: string; end: string };

export const DEFAULT_MEETING_HOURS: MeetingHours = { start: "08:30", end: "17:30" };
export const SLOT_MINUTES = 30;
export const MAX_ADVANCE_DAYS = 30;
export const AGENDA_MAX_LENGTH = 200;
/** Batas booking aktif (ACTIVE & belum selesai) per orang; Admin tidak dibatasi (audit keamanan 2026-11-26, F7). */
export const MAX_ACTIVE_BOOKINGS_PER_USER = 10;

export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Jam tepat di kelipatan 30 menit (08:30, 09:00, …). */
export function isSlotTime(time: string): boolean {
  return timeToMinutes(time) % SLOT_MINUTES === 0;
}

/** Pilihan jam mulai (jam buka … tutup − 30 menit) dan jam selesai (buka + 30 menit … tutup). */
export function slotOptions(hours: MeetingHours): { starts: string[]; ends: string[] } {
  const open = timeToMinutes(hours.start);
  const close = timeToMinutes(hours.end);
  const times: string[] = [];
  for (let m = open; m <= close; m += SLOT_MINUTES) times.push(minutesToTime(m));
  return { starts: times.slice(0, -1), ends: times.slice(1) };
}

/** Tanggal terakhir yang boleh dibooking dari hari ini. */
export function lastBookableDate(todayIso: string): string {
  return addDays(todayIso, MAX_ADVANCE_DAYS);
}

export type DayBlock = "WEEKEND" | "HOLIDAY" | "PAST" | "TOO_FAR";

/** Alasan satu tanggal tidak bisa dibooking (untuk kalender & panel hari), atau null bila bisa. */
export function dayBlock(dateIso: string, { todayIso, holiday }: { todayIso: string; holiday: boolean }): DayBlock | null {
  const weekday = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return "WEEKEND";
  if (holiday) return "HOLIDAY";
  if (dateIso < todayIso) return "PAST";
  if (dateIso > lastBookableDate(todayIso)) return "TOO_FAR";
  return null;
}

export const DAY_BLOCK_LABEL: Record<DayBlock, string> = {
  WEEKEND: "Sabtu dan Minggu tidak bisa dibooking",
  HOLIDAY: "Hari libur tidak bisa dibooking",
  PAST: "Tanggal sudah lewat",
  TOO_FAR: `Booking paling jauh ${MAX_ADVANCE_DAYS} hari ke depan`,
};

export type BookingWindow = { date: string; start: string; end: string };

/**
 * Alasan jadwal booking ditolak (pesan untuk user), atau null bila boleh. Dicek di server saat membuat & mengubah booking;
 * bentrok dengan booking lain TIDAK dicek di sini — itu tugas exclusion constraint di database.
 */
export function bookingWindowProblem(
  { date, start, end }: BookingWindow,
  { hours, now, holiday }: { hours: MeetingHours; now: Date; holiday: boolean },
): string | null {
  const block = dayBlock(date, { todayIso: toJakartaIsoDate(now), holiday });
  if (block) return DAY_BLOCK_LABEL[block];
  if (!isSlotTime(start) || !isSlotTime(end)) return `Jam harus kelipatan ${SLOT_MINUTES} menit`;
  if (end <= start) return "Jam selesai harus setelah jam mulai";
  if (start < hours.start || end > hours.end) return `Di luar jam operasional ruang meeting (${hours.start}–${hours.end})`;
  if (jakartaDateTime(date, start).getTime() <= now.getTime()) return "Jam mulai sudah lewat, pilih jam lain";
  return null;
}

/** "09:00–10:30". */
export function timeRangeLabel(start: string, end: string): string {
  return `${start}–${end}`;
}

/**
 * Aksi yang boleh dilakukan viewer atas satu booking aktif (tampilan; service tetap mengecek ulang dengan aturan yang sama):
 * pemilik mengubah satu kali & membatalkan sebelum jam mulai; Admin membatalkan booking siapa pun sebelum jam selesai,
 * dengan alasan wajib bila bukan miliknya.
 */
export function bookingRights(
  booking: { userId: string; edited: boolean; startAt: string | Date; endAt: string | Date },
  viewer: { id: string; isAdmin: boolean },
  now: Date,
) {
  const start = new Date(booking.startAt).getTime();
  const end = new Date(booking.endAt).getTime();
  const isOwner = booking.userId === viewer.id;
  return {
    isOwner,
    canEdit: isOwner && !booking.edited && start > now.getTime(),
    canCancel: viewer.isAdmin ? end > now.getTime() : isOwner && start > now.getTime(),
    needsReason: !isOwner,
  };
}

/**
 * Rentang jam kosong satu ruang di satu hari (untuk panel hari): jam operasional dikurangi booking. `from` = mulai paling
 * awal (hari ini: slot berikutnya setelah jam sekarang).
 */
export function freeRanges(hours: MeetingHours, busy: { start: string; end: string }[], from?: string): { start: string; end: string }[] {
  const ranges: { start: string; end: string }[] = [];
  let cursor = from && from > hours.start ? from : hours.start;
  for (const slot of [...busy].sort((a, b) => a.start.localeCompare(b.start))) {
    if (slot.start > cursor) ranges.push({ start: cursor, end: slot.start < hours.end ? slot.start : hours.end });
    if (slot.end > cursor) cursor = slot.end;
  }
  if (cursor < hours.end) ranges.push({ start: cursor, end: hours.end });
  return ranges.filter((range) => range.start < range.end);
}

/** Slot pertama yang belum lewat di hari ini (jam sekarang dibulatkan ke atas ke kelipatan 30 menit). */
export function nextSlotTime(now: Date): string {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(now)
    .split(":")
    .map(Number);
  return minutesToTime(Math.min(24 * 60 - SLOT_MINUTES, Math.ceil((h * 60 + m + 1) / SLOT_MINUTES) * SLOT_MINUTES));
}
