// Kalender bulanan booking ruang meeting (Fase 17, 2026-11-23). Server component.
// Pola tampilan mengikuti components/shared/leave-calendar.tsx:
// - ≥ 640 px: grid 7 kolom; tiap tanggal berisi chip booking "09:00–10:30 · R1" + pemesan; klik tanggal → panel hari.
// - HP: kalender mini (angka + titik warna per ruang); sentuh tanggal → panel hari di bawahnya.
// Hanya satu versi yang tampil per ukuran layar, jadi tautan tanggal (dengan aria-label lengkap) tidak terbaca ganda.
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { sectionIconClass, sectionTitleClass } from "@/components/shared/section-header";
import type { MeetingCalendarDay } from "@/lib/services/meeting-room-queries";
import type { MeetingRoomView } from "@/lib/services/meeting-room-queries";
import { cn } from "@/lib/utils";
import { roomShort, roomTone, weekdayDate } from "./meeting-ui";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const navLinkClass =
  "flex size-11 items-center justify-center rounded-[14px] text-ink-2 transition-colors duration-300 hover:bg-ink/[0.07] hover:text-ink focus-visible:outline-2 focus-visible:outline-ink";

function shiftMonth(yearMonth: string, delta: number) {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function dayLabel(day: MeetingCalendarDay) {
  const parts = [weekdayDate(day.date)];
  if (day.holiday) parts.push(`libur: ${day.holiday}`);
  parts.push(day.bookings.length ? `${day.bookings.length} booking` : "belum ada booking");
  return parts.join(", ");
}

export function MeetingCalendar({
  weeks,
  yearMonth,
  todayIso,
  selected,
  rooms,
}: {
  weeks: MeetingCalendarDay[][];
  yearMonth: string;
  todayIso: string;
  selected: string;
  /** Untuk legenda warna (ruang aktif + ruang yang punya booking di bulan ini). */
  rooms: MeetingRoomView[];
}) {
  const label = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${yearMonth}-01T00:00:00Z`));
  const monthBookings = weeks.flat().filter((d) => d.inMonth).reduce((sum, d) => sum + d.bookings.length, 0);
  const href = (ym: string, date?: string) => `/ruang-meeting?bulan=${ym}${date ? `&tanggal=${date}` : ""}`;

  return (
    <section className="panel-surface flex min-w-0 flex-col gap-4 p-5 sm:p-6" aria-labelledby="kalender-ruang-meeting">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className={sectionIconClass}>
            <CalendarDays className="size-5" aria-hidden />
          </div>
          <div>
            <h2 id="kalender-ruang-meeting" className={sectionTitleClass}>
              Kalender Ruang Meeting
            </h2>
            <p className="text-sm text-muted-foreground">
              {monthBookings ? `${monthBookings} booking di bulan ini` : "Belum ada booking di bulan ini"}
            </p>
          </div>
        </div>
        <nav aria-label="Pilih bulan kalender" className="flex items-center gap-1">
          <Link href={href(shiftMonth(yearMonth, -1))} scroll={false} className={navLinkClass} aria-label="Bulan sebelumnya">
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <span className="min-w-32 text-center text-sm font-semibold capitalize" aria-live="polite">
            {label}
          </span>
          <Link href={href(shiftMonth(yearMonth, 1))} scroll={false} className={navLinkClass} aria-label="Bulan berikutnya">
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        </nav>
      </div>

      {/* HP: kalender mini. */}
      <div className="grid grid-cols-7 gap-1 sm:hidden">
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-0.5 text-center text-[11px] font-semibold text-ink-3" aria-hidden>
            {d}
          </span>
        ))}
        {weeks.flat().map((day) => {
          if (!day.inMonth) return <span key={day.date} aria-hidden />;
          const roomNumbers = [...new Set(day.bookings.map((b) => b.roomNumber))];
          return (
            <Link
              key={day.date}
              href={`${href(yearMonth, day.date)}#hari-terpilih`}
              aria-label={dayLabel(day)}
              aria-current={day.date === selected ? "date" : undefined}
              className={cn(
                "flex aspect-square min-h-9 flex-col items-center justify-center gap-[3px] rounded-[10px] text-[13px] font-semibold text-ink tabular-nums transition-transform duration-150 active:scale-95",
                day.weekend && !day.holiday && "text-ink-3",
                day.holiday && "bg-danger-soft text-danger",
                day.date === todayIso && "shadow-[inset_0_0_0_2px_var(--brand)]",
                day.date === selected && "bg-ink text-white",
              )}
            >
              {Number(day.date.slice(8))}
              <span className="flex h-1.5 items-center gap-[3px]" aria-hidden>
                {roomNumbers.map((n) => (
                  <span key={n} className={cn("size-1.5 rounded-full", roomTone(n).dot)} />
                ))}
              </span>
            </Link>
          );
        })}
      </div>

      {/* ≥ 640 px: grid bulan. */}
      <div className="hidden grid-cols-7 gap-1 text-xs sm:grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-1 pb-1 text-center font-semibold text-muted-foreground" aria-hidden>
            {d}
          </div>
        ))}
        {weeks.flat().map((day) => (
          <Link
            key={day.date}
            href={href(day.inMonth ? yearMonth : day.date.slice(0, 7), day.date)}
            scroll={false}
            aria-label={dayLabel(day)}
            aria-current={day.date === selected ? "date" : undefined}
            className={cn(
              "flex min-h-24 min-w-0 flex-col gap-1 rounded-lg border border-border p-1.5 text-left transition-colors outline-none hover:border-ink/30 focus-visible:ring-2 focus-visible:ring-ink",
              !day.inMonth && "border-dashed text-mute",
              day.weekend && "bg-muted/50",
              day.holiday && "border-danger/40 bg-danger-soft",
              day.date === todayIso && "ring-2 ring-primary",
              day.date === selected && "border-ink shadow-[inset_0_0_0_1px_var(--ink)]",
            )}
          >
            <span className={cn("font-semibold tabular-nums", day.holiday && "text-danger")}>{Number(day.date.slice(8))}</span>
            {day.holiday && <span className="line-clamp-2 leading-tight text-danger">{day.holiday}</span>}
            {day.bookings.slice(0, 3).map((b) => (
              <span key={b.id} className={cn("flex min-w-0 flex-col rounded-md px-1.5 py-0.5 leading-tight", roomTone(b.roomNumber).chip)}>
                <span className="truncate font-semibold tabular-nums">
                  {b.start}–{b.end} · {roomShort(b.roomNumber)}
                </span>
                <span className="truncate">{b.ownerName}</span>
              </span>
            ))}
            {day.bookings.length > 3 && <span className="text-muted-foreground">+{day.bookings.length - 3} lainnya</span>}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-hidden>
        {rooms.map((room) => (
          <span key={room.id} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded", roomTone(room.number).dot)} /> {roomShort(room.number)} = {room.name}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-danger/40 bg-danger-soft" /> Libur
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded ring-2 ring-primary" /> Hari ini
        </span>
      </div>
    </section>
  );
}
