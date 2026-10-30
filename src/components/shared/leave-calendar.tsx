// Kalender bulanan cuti & libur (Fase 14) — dipakai dashboard & halaman Kalender. Server component.
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { CalendarDay } from "@/lib/services/leave-queries";
import { cn } from "@/lib/utils";
import { sectionIconClass, sectionTitleClass } from "./section-header";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const agendaDate = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function shiftMonth(yearMonth: string, delta: number) {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

const navLinkClass =
  "flex size-11 items-center justify-center rounded-[14px] text-ink-2 transition-colors duration-300 hover:bg-ink/[0.07] hover:text-ink focus-visible:outline-2 focus-visible:outline-ink";

const agendaId = (date: string) => `agenda-${date}`;

/**
 * Tampilan (audit UI 2026-10-27):
 * - ≥ 640 px: grid 7 kolom seperti biasa (hiasan visual, disembunyikan dari pembaca layar).
 * - HP: kalender mini (angka tanggal + titik penanda, tanpa nama) supaya gambaran sebulan tetap terlihat, lalu
 *   daftar agenda berisi nama lengkap — tanpa geser ke samping dan tanpa tooltip (`title` tidak bisa dibuka di
 *   layar sentuh). Menyentuh tanggal bertanda menggulir ke agendanya.
 * - Pembaca layar (semua ukuran): hanya daftar agenda.
 */
export function LeaveCalendar({
  weeks,
  yearMonth,
  todayIso,
  hrefFor,
  className,
}: {
  weeks: CalendarDay[][];
  yearMonth: string;
  todayIso: string;
  /** Link ke bulan lain, mis. (ym) => `/dashboard?kal=${ym}`. */
  hrefFor: (yearMonth: string) => string;
  className?: string;
}) {
  const label = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${yearMonth}-01T00:00:00Z`));
  const monthDays = weeks.flat().filter((d) => d.inMonth);
  const leaveDays = monthDays.filter((d) => d.leaves.length > 0);
  const people = new Set(leaveDays.flatMap((d) => d.leaves.map((l) => l.name)));
  const agenda = monthDays.filter((d) => d.holiday || d.leaves.length > 0);

  return (
    // Gaya kalender Dashboard: permukaan lembut, ubin ikon, judul bagian 21px.
    <section className={cn("panel-surface flex min-w-0 flex-col gap-4 p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className={sectionIconClass}>
            <CalendarDays className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className={sectionTitleClass}>Kalender Cuti & Libur</h2>
            <p className="text-sm text-muted-foreground">
              {people.size ? `${people.size} karyawan cuti di bulan ini` : "Tidak ada karyawan cuti di bulan ini"}
            </p>
          </div>
        </div>
        <nav aria-label="Pilih bulan kalender" className="flex items-center gap-1">
          {/* scroll={false}: ganti bulan tidak melompat ke atas halaman (Next.js menggulir ke awal halaman bila bagian
              atasnya sudah tidak terlihat), 2026-10-30. */}
          <Link href={hrefFor(shiftMonth(yearMonth, -1))} scroll={false} className={navLinkClass} aria-label="Bulan sebelumnya">
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <span className="min-w-32 text-center text-sm font-semibold capitalize" aria-live="polite">
            {label}
          </span>
          <Link href={hrefFor(shiftMonth(yearMonth, 1))} scroll={false} className={navLinkClass} aria-label="Bulan berikutnya">
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        </nav>
      </div>

      {/* Kalender mini (HP saja). Isinya sama dengan agenda di bawah → disembunyikan dari pembaca layar. */}
      <MiniMonth weeks={weeks} todayIso={todayIso} />

      {/* Agenda: terlihat di HP, dibacakan pembaca layar di semua ukuran. */}
      <div className="flex flex-col gap-2 sm:sr-only">
        <h3 className="text-[13px] font-bold tracking-[0.02em] text-ink-3 uppercase">Daftar cuti & libur</h3>
        {agenda.length === 0 ? (
          <p className="text-sm text-ink-3">Tidak ada cuti atau libur di bulan {label}.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {agenda.map((day) => (
              <li
                key={day.date}
                id={agendaId(day.date)}
                aria-current={day.date === todayIso ? "date" : undefined}
                className={cn(
                  // scroll-mt: tidak tertutup topbar saat digulir dari kalender mini; :target = sorot tanggal yang dipilih.
                  "flex scroll-mt-24 flex-col gap-1.5 rounded-[16px] bg-white px-4 py-3 shadow-[inset_0_0_0_1px_var(--line)] transition-shadow duration-300 target:shadow-[inset_0_0_0_2px_var(--brand),0_0_0_4px_var(--brand-ring)]",
                  day.date === todayIso && "shadow-[inset_0_0_0_2px_var(--brand)]",
                )}
              >
                <p className="text-sm font-bold text-ink first-letter:uppercase">
                  {agendaDate.format(new Date(`${day.date}T00:00:00Z`))}
                  {day.date === todayIso && <span className="ml-2 text-xs font-semibold text-brand-deep">Hari ini</span>}
                </p>
                {day.holiday && (
                  <p className="text-sm font-semibold text-red-ink">
                    <span className="sr-only">Libur: </span>
                    {day.holiday}
                  </p>
                )}
                {day.leaves.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Cuti">
                    {day.leaves.map((l) => (
                      <li
                        key={l.name}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[13px] font-semibold",
                          l.isDirector ? "bg-warning-soft text-warning" : "bg-info-soft text-brand-deep",
                        )}
                      >
                        {l.isDirector ? `Direktur cuti · ${l.name}` : l.name}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Grid bulan (≥ 640 px). Isinya sama dengan agenda di atas, jadi disembunyikan dari pembaca layar. */}
      <div className="hidden grid-cols-7 gap-1 text-xs sm:grid" aria-hidden>
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-1 pb-1 text-center font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
        {weeks.flat().map((day) => {
          const hasLeave = day.leaves.length > 0;
          const director = day.leaves.some((l) => l.isDirector);
          return (
            <div
              key={day.date}
              title={[day.holiday, ...day.leaves.map((l) => (l.isDirector ? `Direktur cuti: ${l.name}` : `Cuti: ${l.name}`))].filter(Boolean).join("\n") || undefined}
              className={cn(
                "flex min-h-20 min-w-0 flex-col gap-0.5 rounded-lg border border-border p-1.5",
                // Tanggal di luar bulan: redup lewat warna (≥ 4,5:1), bukan opacity (2,5:1 — audit UI 2026-10-27).
                !day.inMonth && "border-dashed text-mute",
                day.weekend && "bg-muted/50",
                day.holiday && "border-danger/40 bg-danger-soft",
                hasLeave && !day.holiday && (director ? "border-warning/50 bg-warning-soft" : "border-primary/40 bg-info-soft"),
                day.date === todayIso && "ring-2 ring-primary",
              )}
            >
              <span className={cn("font-semibold tabular-nums", day.holiday && "text-danger")}>{Number(day.date.slice(8))}</span>
              {day.holiday && <span className="line-clamp-2 leading-tight text-danger">{day.holiday}</span>}
              {day.leaves.slice(0, 3).map((l) => (
                <span key={l.name} className="truncate leading-tight">
                  {l.isDirector ? "Direktur cuti · " : ""}
                  {l.name}
                </span>
              ))}
              {day.leaves.length > 3 && <span className="text-muted-foreground">+{day.leaves.length - 3} lainnya</span>}
            </div>
          );
        })}
      </div>

      <div className="hidden flex-wrap gap-3 text-xs text-muted-foreground sm:flex" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-primary/40 bg-info-soft" /> Cuti
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-warning/50 bg-warning-soft" /> Direktur cuti
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-danger/40 bg-danger-soft" /> Libur
        </span>
      </div>
    </section>
  );
}

/**
 * Kalender mini untuk HP (< 640 px): 7 kolom ±36 px berisi angka tanggal saja — nama karyawan tidak muat di
 * selebar itu, jadi dipindah ke daftar agenda. Titik biru = cuti, titik oranye = Direktur cuti, angka merah di
 * latar merah muda = libur, cincin biru = hari ini. Tanggal bertanda adalah tautan ke agendanya (sentuh → gulir).
 * `aria-hidden` + `tabIndex={-1}`: pembaca layar & keyboard memakai daftar agenda yang berisi informasi yang sama.
 */
function MiniMonth({ weeks, todayIso }: { weeks: CalendarDay[][]; todayIso: string }) {
  const days = weeks.flat();
  const hasEvents = days.some((d) => d.inMonth && (d.holiday || d.leaves.length > 0));
  return (
    <div className="flex flex-col gap-3 sm:hidden" aria-hidden>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-0.5 text-center text-[11px] font-semibold text-ink-3">
            {d}
          </span>
        ))}
        {days.map((day) => {
          // Tanggal bulan lain dikosongkan (pola kalender HP): angkanya mirip warna akhir pekan & membingungkan.
          if (!day.inMonth) return <span key={day.date} />;
          const leave = day.leaves.some((l) => !l.isDirector);
          const director = day.leaves.some((l) => l.isDirector);
          const marked = Boolean(day.holiday) || leave || director;
          const className = cn(
            "flex aspect-square min-h-9 flex-col items-center justify-center gap-[3px] rounded-[10px] text-[13px] font-semibold text-ink tabular-nums",
            day.weekend && !day.holiday && "text-ink-3",
            day.holiday && "bg-danger-soft text-danger",
            !day.holiday && (leave || director) && "bg-white shadow-[inset_0_0_0_1px_var(--line)]",
            day.date === todayIso && "shadow-[inset_0_0_0_2px_var(--brand)]",
            marked && "transition-transform duration-150 active:scale-95",
          );
          const content = (
            <>
              {Number(day.date.slice(8))}
              {/* Baris titik selalu ada (kosong pun) supaya angka sejajar di semua sel. */}
              <span className="flex h-1.5 items-center gap-[3px]">
                {leave && <span className="size-1.5 rounded-full bg-brand" />}
                {director && <span className="size-1.5 rounded-full bg-warning" />}
              </span>
            </>
          );
          return marked ? (
            <a key={day.date} href={`#${agendaId(day.date)}`} tabIndex={-1} className={className}>
              {content}
            </a>
          ) : (
            <span key={day.date} className={className}>
              {content}
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-brand" /> Cuti
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-warning" /> Direktur cuti
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[4px] bg-danger-soft shadow-[inset_0_0_0_1px_var(--red-ring)]" /> Libur
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[4px] shadow-[inset_0_0_0_2px_var(--brand)]" /> Hari ini
        </span>
      </div>
      {hasEvents && <p className="text-xs text-ink-3">Sentuh tanggal bertanda untuk melihat detailnya.</p>}
    </div>
  );
}
