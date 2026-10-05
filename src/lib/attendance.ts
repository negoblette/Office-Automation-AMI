// Perhitungan absensi murni (tanpa database) — clock in / clock out (keputusan user 2026-09-25).
// Jam berupa string `HH:MM` zona Asia/Jakarta; tanggal `YYYY-MM-DD`.
import { formatTime, toJakartaIsoDate } from "@/lib/format";

export type WorkHours = { workStart: string; workEnd: string };
export const DEFAULT_WORK_HOURS: WorkHours = { workStart: "08:00", workEnd: "17:00" };

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Hari kerja = Senin–Jumat dan bukan hari libur (sama dengan hitungan cuti, LV-05). */
export function isWorkday(dateIso: string, holidays: ReadonlySet<string>): boolean {
  const weekday = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(dateIso);
}

/** Menit terlambat: clock in setelah jam masuk di hari kerja (menit dibulatkan ke bawah). */
export function lateMinutes(clockIn: Date, hours: WorkHours, workday: boolean): number {
  if (!workday) return 0;
  return Math.max(0, timeToMinutes(formatTime(clockIn)) - timeToMinutes(hours.workStart));
}

/** Menit pulang cepat: clock out sebelum jam pulang di hari kerja yang sama. */
export function earlyLeaveMinutes(clockOut: Date | null, dateIso: string, hours: WorkHours, workday: boolean): number {
  if (!workday || !clockOut || toJakartaIsoDate(clockOut) !== dateIso) return 0;
  return Math.max(0, timeToMinutes(hours.workEnd) - timeToMinutes(formatTime(clockOut)));
}

/** Tanggal + jam Jakarta → Date (UTC). Jakarta tidak memakai DST (selalu +07:00). */
export function jakartaDateTime(dateIso: string, time: string): Date {
  return new Date(`${dateIso}T${time}:00+07:00`);
}

/** "8 jam 15 menit". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} jam${m ? ` ${m} menit` : ""}` : `${m} menit`;
}

export type DayStatus =
  | "PRESENT" // hadir tepat waktu
  | "LATE" // terlambat
  | "NO_CLOCK_OUT" // lupa clock out (hari sudah lewat)
  | "WORKING" // sudah clock in hari ini, belum clock out
  | "LEAVE" // cuti disetujui
  | "HOLIDAY" // hari libur
  | "WEEKEND"
  | "ABSENT" // hari kerja tanpa absen & tanpa cuti
  | "SICK" // appeal disetujui: sakit (Fase 14)
  | "VISIT" // appeal disetujui: kunjungan keluar
  | "APPEAL_PENDING" // appeal menunggu persetujuan
  | "NOT_YET" // hari ini belum clock in
  | "NOT_EMPLOYED"; // di luar periode kerja

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  PRESENT: "Hadir",
  LATE: "Terlambat",
  NO_CLOCK_OUT: "Tidak clock out",
  WORKING: "Sedang bekerja",
  LEAVE: "Cuti",
  HOLIDAY: "Libur",
  WEEKEND: "Akhir pekan",
  ABSENT: "Tidak hadir",
  SICK: "Sakit",
  VISIT: "Kunjungan keluar",
  APPEAL_PENDING: "Appeal menunggu",
  NOT_YET: "Belum clock in",
  NOT_EMPLOYED: "—",
};

export type DayRecord = { clockOut: Date | string | null; lateMinutes: number } | null;

/**
 * Status satu hari untuk rekap. Absen tercatat mengalahkan cuti/libur (mis. lembur di akhir pekan).
 * Hari ini tanpa absen = "Belum clock in", bukan "Tidak hadir".
 */
export function dayStatus(input: {
  dateIso: string;
  todayIso: string;
  employed: boolean;
  record: DayRecord;
  onLeave: boolean;
  holiday: boolean;
  /** Appeal hari itu (Fase 14); REJECTED diabaikan. */
  appeal?: { reason: "SICK" | "VISIT"; status: string } | null;
}): DayStatus {
  const { dateIso, todayIso, employed, record, onLeave, holiday, appeal } = input;
  if (record) {
    if (!record.clockOut) return dateIso === todayIso ? "WORKING" : "NO_CLOCK_OUT";
    return record.lateMinutes > 0 ? "LATE" : "PRESENT";
  }
  if (!employed) return "NOT_EMPLOYED";
  if (appeal?.status === "APPROVED") return appeal.reason;
  if (appeal?.status === "PENDING") return "APPEAL_PENDING";
  if (onLeave) return "LEAVE";
  const weekday = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return "WEEKEND";
  if (holiday) return "HOLIDAY";
  return dateIso === todayIso ? "NOT_YET" : "ABSENT";
}

/** Batas appeal: maks 7 hari sejak tanggal tidak hadir (Fase 14). Lewat dari ini → potong cuti. */
export const APPEAL_WINDOW_DAYS = 7;

/** Tanggal terakhir boleh mengajukan appeal untuk `dateIso`. */
export function appealDeadline(dateIso: string): string {
  return new Date(Date.parse(`${dateIso}T00:00:00Z`) + APPEAL_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
}

export const APPEAL_REASON_LABEL = { SICK: "Sakit", VISIT: "Kunjungan keluar" } as const;
