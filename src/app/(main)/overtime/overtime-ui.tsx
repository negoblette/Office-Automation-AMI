"use client";

import { Loader2, LogIn, LogOut, Timer, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { SelectInputField, TextareaField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { useFeedback } from "@/components/shared/feedback";
import { StatusBadge } from "@/components/shared/status-badge";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuration } from "@/lib/attendance";
import { formatDate } from "@/lib/format";
import type { OvertimeFinishOptions, OvertimeRow } from "@/lib/services/overtime-queries";
import { cn } from "@/lib/utils";
import { overtimeFinishSchema } from "@/lib/validators/overtime";
import { cancelOvertimeAction, finishOvertimeAction, startOvertimeAction } from "./actions";

/** Durasi berjalan sejak clock in (diperbarui tiap 30 detik). Hanya tampilan. */
function useElapsedMinutes(sinceIso: string | null) {
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    if (!sinceIso) return;
    const tick = () => setMinutes(Math.max(0, Math.floor((Date.now() - Date.parse(sinceIso)) / 60_000)));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [sinceIso]);
  return minutes;
}

/**
 * Kartu overtime (2026-10-30): Mulai Overtime (clock in) → selama berjalan tampil durasi; Clock Out membuka dialog
 * finalize (customer + project + pekerjaan). Bisa beberapa sesi per hari.
 */
export function OvertimeClockCard({ open, options }: { open: OvertimeRow | null; options: OvertimeFinishOptions }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { confirm, notify } = useFeedback();
  const elapsed = useElapsedMinutes(open?.clockInAt ?? null);

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, message: string) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notify(message);
        router.refresh();
      } else setError(result.error ?? "Gagal menyimpan overtime");
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-center gap-4">
        <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl", open ? "bg-warning-soft text-warning" : "bg-info-soft text-primary")}>
          <Timer className="size-6" aria-hidden />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{open ? "Overtime berjalan" : "Overtime"}</p>
          {open ? (
            <>
              <p className="text-2xl font-bold tabular-nums">{elapsed === null ? "—" : formatDuration(elapsed)}</p>
              <p className="text-sm text-muted-foreground">
                Mulai <span className="font-semibold text-foreground">{open.clockIn}</span> · {formatDate(`${open.date}T00:00:00Z`, "weekday")}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Tekan Mulai Overtime saat mulai lembur. Saat selesai, Clock Out lalu pilih customer & project. Bisa beberapa kali sehari.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-1 text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
      {open ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="lg"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: "Batalkan overtime ini?",
                description: `Sesi yang dimulai ${open.clockIn} dihapus (untuk salah tekan Mulai Overtime).`,
                confirmLabel: "Batalkan Overtime",
                cancelLabel: "Tidak",
                tone: "danger",
              });
              if (ok) run(() => cancelOvertimeAction(open.id), "Overtime dibatalkan");
            }}
          >
            <X aria-hidden /> Batalkan
          </Button>
          <FinishDialog overtime={open} options={options} />
        </div>
      ) : (
        <Button size="lg" disabled={pending} onClick={() => run(startOvertimeAction, "Overtime dimulai")}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogIn aria-hidden />} Mulai Overtime
        </Button>
      )}
    </section>
  );
}

/** Clock out = finalize: customer, project milik customer itu, dan pekerjaan yang dilakukan. */
function FinishDialog({ overtime, options }: { overtime: OvertimeRow; options: OvertimeFinishOptions }) {
  return (
    <FormDialog
      trigger={
        <Button size="lg">
          <LogOut aria-hidden /> Clock Out
        </Button>
      }
      title="Selesai Overtime"
      description={`Overtime mulai ${overtime.clockIn}. Jam selesai dicatat saat Anda menekan Clock Out. Pilih customer & project yang dikerjakan.`}
      schema={overtimeFinishSchema}
      defaults={{ customerId: "", projectId: "", activity: "" }}
      submitLabel="Clock Out"
      successMessage="Overtime selesai"
      action={(values) => finishOvertimeAction(overtime.id, values)}
    >
      <SelectInputField name="customerId" label="Customer" required options={options.customers} placeholder="Pilih customer…" />
      <ProjectField projects={options.projects} />
      <TextareaField name="activity" label="Pekerjaan" required />
    </FormDialog>
  );
}

/** Project milik customer terpilih; ganti customer → project dikosongkan. */
function ProjectField({ projects }: { projects: OvertimeFinishOptions["projects"] }) {
  const { control, getValues, setValue } = useFormContext();
  const customerId = useWatch({ control, name: "customerId" });
  const options = useMemo(() => projects.filter((p) => p.customerId === customerId), [projects, customerId]);
  useEffect(() => {
    const current = getValues("projectId");
    if (current && !options.some((p) => p.value === current)) setValue("projectId", "");
  }, [options, getValues, setValue]);
  return (
    <SelectInputField
      name="projectId"
      label="Project"
      required
      options={options}
      placeholder={customerId ? "Pilih project…" : "Pilih customer dulu"}
      disabled={!customerId}
      hint={customerId && options.length === 0 ? "Customer ini belum punya project aktif. Hubungi tim Sales atau Admin." : undefined}
    />
  );
}

const timeClass = "font-mono text-[13.5px] tabular-nums";

/**
 * Riwayat overtime satu bulan. Beberapa sesi di hari yang sama tampil sebagai baris berurutan; tanggal hanya ditulis
 * di baris pertama. `withEmployee` = kolom nama karyawan (rekap Admin).
 */
export function OvertimeTable({ rows, withEmployee = false, viewerEmployeeId }: { rows: OvertimeRow[]; withEmployee?: boolean; viewerEmployeeId?: string | null }) {
  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-ink-3">Belum ada overtime di bulan ini.</p>;
  }
  return (
    <Table className={cn("table-fixed", withEmployee ? "min-w-[1040px]" : "min-w-[880px]")} scrollLabel={withEmployee ? "Tabel rekap overtime karyawan" : "Tabel riwayat overtime"}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[17%]">Tanggal</TableHead>
          {withEmployee && <TableHead className="w-[14%]">Karyawan</TableHead>}
          <TableHead className="w-[8%]">Mulai</TableHead>
          <TableHead className="w-[10%]">Selesai</TableHead>
          <TableHead className="w-[9%]">Durasi</TableHead>
          <TableHead>Customer · Project</TableHead>
          <TableHead className="w-[14%]">Reimburse</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => {
          const prev = rows[index - 1];
          const sameGroup = prev && prev.date === row.date && (!withEmployee || prev.employeeId === row.employeeId);
          const session = sameGroup ? rows.slice(0, index).filter((r) => r.date === row.date && r.employeeId === row.employeeId).length + 1 : 1;
          return (
            <TableRow key={row.id} className={cn(sameGroup && "border-t-0")}>
              <TableCell className="h-14">
                {sameGroup ? (
                  <span className="pl-3 text-xs text-ink-3">↳ Sesi {session}</span>
                ) : (
                  <span className="font-bold text-ink">{formatDate(`${row.date}T00:00:00Z`, "weekday")}</span>
                )}
              </TableCell>
              {withEmployee && <TableCell className="h-14 truncate">{sameGroup ? "" : row.employeeName}</TableCell>}
              <TableCell className="h-14">
                <span className={timeClass}>{row.clockIn}</span>
              </TableCell>
              <TableCell className="h-14">
                {row.clockOut ? (
                  <>
                    <span className={timeClass}>{row.clockOut}</span>
                    {row.clockOutDate && <span className="ml-1.5 text-xs text-ink-3">({formatDate(`${row.clockOutDate}T00:00:00Z`, "short")})</span>}
                  </>
                ) : (
                  <StatusBadge variant="warning">Berjalan</StatusBadge>
                )}
              </TableCell>
              <TableCell className="h-14 text-[13.5px]">
                {formatDuration(row.minutes)}
                {row.weekend && <span className="block text-xs text-ink-3">Weekend / libur</span>}
              </TableCell>
              <TableCell className="h-14 whitespace-normal">
                {row.customerName ? (
                  <div className="flex min-w-0 flex-col gap-0.5 py-1.5 text-[13.5px]">
                    <span className="font-semibold text-ink">
                      {row.customerName} · {row.projectName}
                    </span>
                    {row.activity && <span className="text-xs text-ink-3">{row.activity}</span>}
                  </div>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </TableCell>
              <TableCell className="h-14">
                <ReimburseCell row={row} viewerEmployeeId={viewerEmployeeId ?? null} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ReimburseCell({ row, viewerEmployeeId }: { row: OvertimeRow; viewerEmployeeId: string | null }) {
  if (!row.clockOut) return <span className="text-ink-3">—</span>;
  if (!row.reimbursement) return <span className="text-[13px] text-ink-3">Belum di-reimburse</span>;
  const badge = requestStatusBadge(row.reimbursement.status);
  const content = (
    <span className="flex flex-col items-start gap-1">
      <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
      {row.reimbursement.number && <span className="text-xs text-ink-3">{row.reimbursement.number}</span>}
    </span>
  );
  // Draft reimburse hanya bisa dibuka pemiliknya.
  return row.reimbursement.status !== "DRAFT" || row.employeeId === viewerEmployeeId ? (
    <Link href={`/reimburse/${row.reimbursement.id}`} className="hover:underline">
      {content}
    </Link>
  ) : (
    content
  );
}
