"use client";

import { Clock, Loader2, LogIn, LogOut, MessageSquareWarning, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { CheckboxGroupField, DateInputField, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FileUpload } from "@/components/form/file-upload";
import { FormDialog } from "@/components/form/form-dialog";
import { FormField } from "@/components/form/form-field";
import { CLOCK_OUT_CONFIRM } from "@/components/attendance/clock-out-confirm";
import { useFeedback } from "@/components/shared/feedback";
import { FileChip } from "@/components/shared/file-chip";
import { StatusBadge, type StatusVariant } from "@/components/shared/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APPEAL_REASON_LABEL, DAY_STATUS_LABEL, type DayStatus, formatDuration } from "@/lib/attendance";
import { formatDate } from "@/lib/format";
import type { AttendanceDay, TodayAttendance } from "@/lib/services/attendance-queries";
import { cn } from "@/lib/utils";
import { appealDatesSchema, attendanceCorrectionSchema } from "@/lib/validators/attendance";
import { clockInAction, clockOutAction, correctAttendanceAction, submitAppealAction } from "./actions";

export const DAY_STATUS_VARIANT: Record<DayStatus, StatusVariant> = {
  PRESENT: "success",
  LATE: "warning",
  NO_CLOCK_OUT: "danger",
  WORKING: "info",
  LEAVE: "info",
  HOLIDAY: "neutral",
  WEEKEND: "neutral",
  ABSENT: "danger",
  SICK: "info",
  VISIT: "info",
  OTHER: "info",
  APPEAL_PENDING: "warning",
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
  const { confirm } = useFeedback();

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
                  {today.autoClockOut && <span> (otomatis — masih bekerja? tekan Clock Out)</span>}
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
      ) : today.onLeave ? (
        <StatusBadge variant="info">Sedang cuti hari ini</StatusBadge>
      ) : today.canClockIn ? (
        <Button size="lg" disabled={pending} onClick={() => run(clockInAction)}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogIn aria-hidden />} Clock In
        </Button>
      ) : today.canClockOut ? (
        <Button
          size="lg"
          variant="outline"
          disabled={pending}
          onClick={async () => {
            if (await confirm(CLOCK_OUT_CONFIRM)) run(clockOutAction);
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
    <nav aria-label="Pilih bulan" className="flex items-center gap-2">
      <Link href={`${baseHref}${sep}bulan=${shift(-1)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        ‹ Sebelumnya
      </Link>
      <span className="min-w-32 text-center text-sm font-semibold" aria-live="polite">
        {label}
      </span>
      {next <= maxMonth ? (
        <Link href={`${baseHref}${sep}bulan=${next}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Berikutnya ›
        </Link>
      ) : (
        <span aria-disabled className={buttonVariants({ variant: "outline", size: "sm", className: "pointer-events-none text-mute shadow-[inset_0_0_0_1px_var(--line)]" })}>
          Berikutnya ›
        </span>
      )}
    </nav>
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
      successMessage="Koreksi absensi tersimpan"
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

/**
 * Kartu Appeal (2026-11-02): daftar hari tidak hadir yang masih bisa di-appeal (≤ 7 hari). Centang tanggalnya, satu
 * alasan & keterangan untuk semuanya → approval Bu Ika. Tanpa appeal yang disetujui, saldo cuti dipotong 1 hari per tanggal.
 */
export function AppealCard({ days }: { days: AttendanceDay[] }) {
  if (days.length === 0) return null;
  const options = days.map((day) => ({
    value: day.date,
    label: `${formatDate(`${day.date}T00:00:00Z`, "weekday")} · batas ${formatDate(`${day.appealDeadline}T00:00:00Z`, "short")}${day.appeal?.status === "REJECTED" ? " · ditolak, bisa diajukan lagi" : ""}`,
  }));
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning">
          <MessageSquareWarning className="size-6" aria-hidden />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">{days.length} hari tidak hadir masih bisa di-appeal</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {days.map((day) => (
              <li key={day.date}>{formatDate(`${day.date}T00:00:00Z`, "short")}</li>
            ))}
          </ul>
        </div>
      </div>
      <FormDialog
        trigger={
          <Button variant="outline" size="lg">
            <MessageSquareWarning aria-hidden /> Ajukan Appeal
          </Button>
        }
        title="Appeal Absensi"
        description="Centang tanggal tidak hadir yang mau di-appeal. Tanpa appeal yang disetujui, saldo cuti dipotong 1 hari per tanggal."
        schema={appealDatesSchema}
        defaults={{ dates: [], reason: "" as never, note: "", fileKey: "", fileName: "" }}
        submitLabel="Ajukan Appeal"
        successMessage="Appeal diajukan"
        action={submitAppealAction}
      >
        <CheckboxGroupField name="dates" label="Tanggal" required options={options} className="[&>div]:flex-col [&>div]:items-start" />
        <SelectInputField name="reason" label="Alasan" required options={Object.entries(APPEAL_REASON_LABEL).map(([value, label]) => ({ value, label }))} />
        <TextareaField name="note" label="Keterangan" required />
        <SickNoteField />
      </FormDialog>
    </section>
  );
}

/** Upload bukti surat keterangan sakit — hanya muncul bila Sakit dipilih; opsional sejak 2026-11-03. */
function SickNoteField() {
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext();
  const reason = useWatch({ control, name: "reason" });
  const fileName = useWatch({ control, name: "fileName" });
  if (reason !== "SICK") return null;
  return (
    <FormField label="Surat keterangan sakit (opsional)" htmlFor="appeal-sick-note" hint="PDF, maks 5 MB." error={errors.fileKey?.message as string | undefined}>
      <Controller
        control={control}
        name="fileKey"
        render={({ field }) => (
          <FileUpload
            id="appeal-sick-note"
            aria-invalid={errors.fileKey ? true : undefined}
            aria-describedby="appeal-sick-note-description"
            value={field.value && fileName ? { key: String(field.value), fileName: String(fileName), mimeType: "application/pdf", sizeBytes: 0 } : null}
            onChange={(file) => {
              field.onChange(file?.key ?? "");
              setValue("fileName", file?.fileName ?? "");
            }}
          />
        )}
      />
    </FormField>
  );
}

/** Tanda untuk sel yang belum ada isinya (jam / durasi). */

function EmptyValue() {
  return <span className="text-mute">-</span>
}

/** Gaya jam masuk / pulang: huruf mono supaya angka sejajar. */
const timeClass = "font-mono text-[13.5px] font-semibold text-ink tabular-nums";

/**
 * Tabel riwayat harian. `correctFor` = employeeId bila Admin boleh mengoreksi. Appeal diajukan dari `AppealCard`
 * (daftar tanggal, 2026-11-02); di tabel hanya tampil batas appeal.
 */

export function AttendanceDaysTable({ days, correctFor }: { days: AttendanceDay[]; correctFor?: string }) {
  if (days.length === 0) {
    return <p className="py-12 text-center text-sm text-ink-3">Belum ada data di bulan ini.</p>;
  }

  return (
    <Table className="min-w-[720px] table-fixed">
      <TableHeader> 
        <TableRow>
          <TableHead className="w-[34%]">Tanggal</TableHead>
          <TableHead className="w-[11%]">Masuk</TableHead>
          <TableHead className="w-[11%]">Pulang</TableHead>
          <TableHead className="w-[12%]">Durasi</TableHead>
          <TableHead>Status</TableHead>
          {correctFor && <TableHead className="w-24">Koreksi</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {days.map((day) => {
          // Akhir pekan & hari libur ditampilkan pudar.
          const muted = day.status === "WEEKEND" || day.status === "HOLIDAY";
          return (
            <TableRow key={day.date} className={cn(muted && "text-mute")}>
              <TableCell className="h-14">
                <span className={cn(!muted && "font-bold text-ink")}>{formatDate(`${day.date}T00:00:00Z`, "weekday")}</span>
              </TableCell>

              <TableCell className="h-14">
                {day.clockIn ? <span className={timeClass}>{day.clockIn}</span> : <EmptyValue />}
                {day.lateMinutes > 0 && <span className="ml-1.5 text-xs font-semibold text-amber-ink">+{day.lateMinutes}m</span>}
              </TableCell>

              <TableCell className="h-14">
                {day.clockOut ? <span className={timeClass}>{day.clockOut}</span> : <EmptyValue />}
                {day.clockOutDate && <span className="ml-1.5 text-xs text-ink-3">({formatDate(`${day.clockOutDate}T00:00:00Z`, "short")})</span>}
                {day.autoClockOut && <span className="ml-1.5 text-xs text-ink-3">otomatis</span>}
                {day.earlyLeaveMinutes > 0 && <span className="ml-1.5 text-xs font-semibold text-amber-ink">−{day.earlyLeaveMinutes}m</span>}
              </TableCell>

              <TableCell className="h-14 text-[13.5px]">
                {day.workedMinutes !== null ? formatDuration(day.workedMinutes) : <EmptyValue />}
              </TableCell>

              <TableCell className="h-14 whitespace-normal">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col items-start gap-1">
                    {muted ? <span className="text-[13px]">{DAY_STATUS_LABEL[day.status]}</span> : <DayStatusBadge status={day.status} />}
                    {day.correctionNote && (
                      <span className="text-xs text-ink-3" title={day.correctionNote}>
                        Dikoreksi {day.correctedBy}: {day.correctionNote}
                      </span>
                    )}
                    {day.appeal && (
                      <span className="text-xs text-ink-3">
                        Appeal {day.appeal.number} · {APPEAL_REASON_LABEL[day.appeal.reason]}: {day.appeal.note}
                      </span>
                    )}
                    {day.appeal?.fileKey && <FileChip fileKey={day.appeal.fileKey} fileName={day.appeal.fileName ?? "Surat sakit"} className="max-w-56" />}
                    {day.appeal?.status === "REJECTED" && (
                      <span className="text-xs font-semibold text-red-ink">
                        Appeal ditolak{day.appeal.rejection ? ` (${day.appeal.rejection})` : ""}{day.canAppeal ? " — bisa direvisi & diajukan lagi" : ""}
                      </span>
                    )}
                    {day.leaveDeducted && <span className="text-xs font-semibold text-red-ink">Saldo cuti dipotong 1 hari</span>}
                    {day.canAppeal && (
                      <span className="text-xs text-ink-3">Batas appeal {formatDate(`${day.appealDeadline}T00:00:00Z`, "short")}</span>
                    )}
                  </div>
                </div>
              </TableCell>

              {correctFor && (
                <TableCell className="h-14">
                  {!muted || day.clockIn ? <CorrectionDialog employeeId={correctFor} day={day} /> : null}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}