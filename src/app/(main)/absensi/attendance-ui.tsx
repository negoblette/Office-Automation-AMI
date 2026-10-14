"use client";

import { Clock, Loader2, LogIn, LogOut, MessageSquareWarning, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { DateInputField, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FileUpload } from "@/components/form/file-upload";
import { FormDialog } from "@/components/form/form-dialog";
import { FormField } from "@/components/form/form-field";
import { FileChip } from "@/components/shared/file-chip";
import { StatusBadge, type StatusVariant } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APPEAL_REASON_LABEL, DAY_STATUS_LABEL, type DayStatus, formatDuration } from "@/lib/attendance";
import { formatDate, toJakartaIsoDate } from "@/lib/format";
import type { AttendanceDay, TodayAttendance } from "@/lib/services/attendance-queries";
import { cn } from "@/lib/utils";
import { appealSchema, attendanceCorrectionSchema } from "@/lib/validators/attendance";
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

/** Appeal satu hari tidak hadir (Fase 14): Sakit / Kunjungan keluar + keterangan → approval Bu Ika. */
function AppealDialog({ day }: { day: AttendanceDay }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm">
          <MessageSquareWarning aria-hidden /> Appeal
        </Button>
      }
      title={`Appeal ${formatDate(`${day.date}T00:00:00Z`, "weekday")}`}
      description={`Tidak masuk karena sakit atau ada kunjungan keluar? Ajukan paling lambat ${formatDate(`${day.appealDeadline}T00:00:00Z`)}. Tanpa appeal yang disetujui, saldo cuti dipotong 1 hari.`}
      schema={appealSchema}
      defaults={
        day.appeal?.status === "REJECTED"
          ? { date: day.date, endDate: "", reason: day.appeal.reason, note: day.appeal.note, fileKey: day.appeal.fileKey ?? "", fileName: day.appeal.fileName ?? "" }
          : { date: day.date, endDate: "", reason: "" as never, note: "", fileKey: "", fileName: "" }
      }
      submitLabel="Ajukan Appeal"
      action={submitAppealAction}
    >
      <DateInputField
        name="endDate"
        label="Sampai tanggal (opsional)"
        min={day.date}
        max={yesterday()}
        hint={`Mulai ${formatDate(`${day.date}T00:00:00Z`, "weekday")}. Isi bila tidak masuk beberapa hari berturut-turut — satu appeal untuk semuanya; Sabtu, Minggu & libur dilewati.`}
      />
      <SelectInputField name="reason" label="Alasan" required options={Object.entries(APPEAL_REASON_LABEL).map(([value, label]) => ({ value, label }))} />
      <TextareaField name="note" label="Keterangan" required />
      <SickNoteField />
    </FormDialog>
  );
}

/** Kemarin (YYYY-MM-DD, WIB) — batas akhir rentang appeal. */
function yesterday() {
  const d = new Date(Date.parse(`${toJakartaIsoDate()}T00:00:00Z`) - 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Upload bukti surat keterangan sakit — wajib untuk alasan Sakit, hanya muncul bila Sakit dipilih (2026-10-14). */
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
    <FormField label="Surat keterangan sakit" htmlFor="appeal-sick-note" required hint="PDF, maks 5 MB." error={errors.fileKey?.message as string | undefined}>
      <Controller
        control={control}
        name="fileKey"
        render={({ field }) => (
          <FileUpload
            id="appeal-sick-note"
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
 * Tabel riwayat harian. `correctFor` = employeeId bila Admin boleh mengoreksi; `appealable` = riwayat
 * milik sendiri (tombol Appeal untuk hari tidak hadir ≤ 7 hari).
 */

export function AttendanceDaysTable({ days, correctFor, appealable = false }: { days: AttendanceDay[]; correctFor?: string; appealable?: boolean }) {
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
                    {day.canAppeal && !appealable && (
                      <span className="text-xs text-ink-3">Batas appeal {formatDate(`${day.appealDeadline}T00:00:00Z`, "short")}</span>
                    )}
                  </div>
                  {appealable && day.canAppeal && <AppealDialog day={day} />}
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