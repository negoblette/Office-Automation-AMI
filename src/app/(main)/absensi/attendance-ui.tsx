"use client";

import { Clock, Loader2, LogIn, LogOut, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { DateInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { StatusBadge, type StatusVariant } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { DAY_STATUS_LABEL, type DayStatus, formatDuration } from "@/lib/attendance";
import { formatDate } from "@/lib/format";
import type { AttendanceDay, TodayAttendance } from "@/lib/services/attendance-queries";
import { cn } from "@/lib/utils";
import { attendanceCorrectionSchema } from "@/lib/validators/attendance";
import { clockInAction, clockOutAction, correctAttendanceAction } from "./actions";

export const DAY_STATUS_VARIANT: Record<DayStatus, StatusVariant> = {
  PRESENT: "success",
  LATE: "warning",
  NO_CLOCK_OUT: "danger",
  WORKING: "info",
  LEAVE: "info",
  HOLIDAY: "neutral",
  WEEKEND: "neutral",
  ABSENT: "danger",
  NOT_YET: "neutral",
  NOT_EMPLOYED: "neutral",
};

export function DayStatusBadge({ status }: { status: DayStatus }) {
  return <StatusBadge variant={DAY_STATUS_VARIANT[status]}>{DAY_STATUS_LABEL[status]}</StatusBadge>;
}

const jakartaClock = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Jam berjalan (WIB). Hanya tampilan — jam absen tetap diambil dari server. */
function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono tabular-nums">{now ? jakartaClock.format(now).replaceAll(".", ":") : "--:--:--"}</span>;
}

/** Kartu Clock In / Clock Out hari ini. */
export function ClockCard({ today, className }: { today: TodayAttendance | null; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setError(result.error ?? "Gagal menyimpan absen");
    });
  };

  return (
    <section className={cn("flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6", className)}>
      <div className="flex items-center gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-info-soft text-primary">
          <Clock className="size-6" aria-hidden />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Absensi · {today ? formatDate(`${today.date}T00:00:00Z`, "weekday") : "—"}
          </p>
          <p className="text-2xl font-bold">
            <LiveClock /> <span className="text-sm font-medium text-muted-foreground">WIB</span>
          </p>
          {today && (
            <p className="text-sm text-muted-foreground">
              Jam kerja {today.hours.workStart}–{today.hours.workEnd}
              {today.clockIn && (
                <>
                  {" · "}Masuk <span className="font-semibold text-foreground">{today.clockIn}</span>
                  {today.lateMinutes > 0 && <span className="text-warning"> (terlambat {formatDuration(today.lateMinutes)})</span>}
                </>
              )}
              {today.clockOut && (
                <>
                  {" · "}Pulang <span className="font-semibold text-foreground">{today.clockOut}</span>
                  {today.earlyLeaveMinutes > 0 && <span className="text-warning"> (pulang cepat {formatDuration(today.earlyLeaveMinutes)})</span>}
                </>
              )}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-1 text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
      {!today ? (
        <p className="text-sm text-muted-foreground">Akun belum terhubung ke data karyawan.</p>
      ) : today.canClockIn ? (
        <Button size="lg" disabled={pending} onClick={() => run(clockInAction)}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogIn aria-hidden />} Clock In
        </Button>
      ) : today.canClockOut ? (
        <Button
          size="lg"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Clock out sekarang? Jam pulang tidak bisa diubah lagi (kecuali dikoreksi Admin).")) run(clockOutAction);
          }}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />} Clock Out
        </Button>
      ) : (
        <StatusBadge variant="success">Absen hari ini lengkap</StatusBadge>
      )}
    </section>
  );
}

/** Pindah bulan lewat query `?bulan=YYYY-MM`. */
export function MonthNav({ yearMonth, baseHref, maxMonth }: { yearMonth: string; baseHref: string; maxMonth: string }) {
  const shift = (delta: number) => {
    const [y, m] = yearMonth.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1 + delta, 1));
    return date.toISOString().slice(0, 7);
  };
  const sep = baseHref.includes("?") ? "&" : "?";
  const label = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${yearMonth}-01T00:00:00Z`));
  const next = shift(1);
  return (
    <div className="flex items-center gap-2">
      <Link href={`${baseHref}${sep}bulan=${shift(-1)}`} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
        ‹ Sebelumnya
      </Link>
      <span className="min-w-36 text-center text-sm font-semibold">{label}</span>
      {next <= maxMonth ? (
        <Link href={`${baseHref}${sep}bulan=${next}`} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
          Berikutnya ›
        </Link>
      ) : (
        <span className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground opacity-50">Berikutnya ›</span>
      )}
    </div>
  );
}

function CorrectionDialog({ employeeId, day, defaultDate }: { employeeId: string; day?: AttendanceDay; defaultDate?: string }) {
  return (
    <FormDialog
      trigger={
        day ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Koreksi absen ${day.date}`}>
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline" size="lg">
            <Plus aria-hidden /> Koreksi / Tambah Absen
          </Button>
        )
      }
      title={day ? `Koreksi absen ${formatDate(`${day.date}T00:00:00Z`)}` : "Koreksi / Tambah Absen"}
      description="Untuk lupa clock in / clock out atau salah absen. Terlambat & pulang cepat dihitung ulang dengan jam kerja saat ini. Perubahan tercatat di audit."
      schema={attendanceCorrectionSchema}
      defaults={{ date: day?.date ?? defaultDate ?? "", clockIn: day?.clockIn ?? "", clockOut: day?.clockOut ?? "", note: "" }}
      submitLabel="Simpan Koreksi"
      action={(values) => correctAttendanceAction(employeeId, values)}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {!day && <DateInputField name="date" label="Tanggal" required />}
        <TextInputField name="clockIn" label="Jam masuk" type="time" required />
        <TextInputField name="clockOut" label="Jam pulang" type="time" hint="Kosongkan bila belum/tidak clock out." />
      </div>
      <TextareaField name="note" label="Alasan koreksi" required />
    </FormDialog>
  );
}

export function AddCorrectionButton({ employeeId, defaultDate }: { employeeId: string; defaultDate: string }) {
  return <CorrectionDialog employeeId={employeeId} defaultDate={defaultDate} />;
}

/** Tabel riwayat harian. `correctFor` = employeeId bila Admin boleh mengoreksi. */
export function AttendanceDaysTable({ days, correctFor }: { days: AttendanceDay[]; correctFor?: string }) {
  if (days.length === 0) return <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-card">Belum ada data di bulan ini.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl bg-card shadow-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs tracking-wider text-muted-foreground uppercase">
            <th className="px-4 py-3 font-semibold">Tanggal</th>
            <th className="px-4 py-3 font-semibold">Masuk</th>
            <th className="px-4 py-3 font-semibold">Pulang</th>
            <th className="px-4 py-3 font-semibold">Durasi</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            {correctFor && <th className="px-4 py-3 font-semibold">Koreksi</th>}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const muted = day.status === "WEEKEND" || day.status === "HOLIDAY";
            return (
              <tr key={day.date} className={cn("border-b border-border last:border-0", muted && "bg-muted/40 text-muted-foreground")}>
                <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(`${day.date}T00:00:00Z`, "weekday")}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  {day.clockIn ?? "—"}
                  {day.lateMinutes > 0 && <span className="ml-1 text-xs text-warning">+{day.lateMinutes}m</span>}
                </td>
                <td className="px-4 py-2.5 tabular-nums">
                  {day.clockOut ?? "—"}
                  {day.clockOutDate && <span className="ml-1 text-xs text-muted-foreground">({formatDate(`${day.clockOutDate}T00:00:00Z`, "short")})</span>}
                  {day.earlyLeaveMinutes > 0 && <span className="ml-1 text-xs text-warning">−{day.earlyLeaveMinutes}m</span>}
                </td>
                <td className="px-4 py-2.5">{day.workedMinutes !== null ? formatDuration(day.workedMinutes) : "—"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-col items-start gap-1">
                    <DayStatusBadge status={day.status} />
                    {day.correctionNote && (
                      <span className="text-xs text-muted-foreground" title={day.correctionNote}>
                        Dikoreksi {day.correctedBy}: {day.correctionNote}
                      </span>
                    )}
                  </div>
                </td>
                {correctFor && (
                  <td className="px-4 py-2.5">
                    {!muted || day.clockIn ? <CorrectionDialog employeeId={correctFor} day={day} /> : null}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
