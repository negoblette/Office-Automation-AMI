// Kalender bulanan cuti & libur (Fase 14) — dipakai dashboard & halaman Kalender. Server component.
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { CalendarDay } from "@/lib/services/leave-queries";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function shiftMonth(yearMonth: string, delta: number) {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

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
  const leaveDays = weeks.flat().filter((d) => d.inMonth && d.leaves.length > 0);
  const people = new Set(leaveDays.flatMap((d) => d.leaves.map((l) => l.name)));

  return (
    <section className={cn("flex min-w-0 flex-col gap-4 rounded-2xl bg-card p-5 shadow-card sm:p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-info-soft text-primary">
            <CalendarDays className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold">Kalender Cuti & Libur</h2>
            <p className="text-sm text-muted-foreground">
              {people.size ? `${people.size} karyawan cuti di bulan ini` : "Tidak ada karyawan cuti di bulan ini"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link href={hrefFor(shiftMonth(yearMonth, -1))} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Bulan sebelumnya">
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-32 text-center text-sm font-semibold capitalize">{label}</span>
          <Link href={hrefFor(shiftMonth(yearMonth, 1))} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Bulan berikutnya">
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-7 gap-1 text-xs">
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
                  "flex min-h-20 flex-col gap-0.5 rounded-lg border border-border p-1.5",
                  !day.inMonth && "opacity-40",
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
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
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
