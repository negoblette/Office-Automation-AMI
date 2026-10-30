"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Send, Timer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";
import { TextareaField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { useUnsavedChangesGuard } from "@/components/form/unsaved-changes";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { useFeedback } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/attendance";
import { formatDate } from "@/lib/format";
import type { OvertimeRow } from "@/lib/services/overtime-queries";
import { overtimeReimbursementFormSchema } from "@/lib/validators/overtime";
import { saveReimbursementAction } from "./actions";

type Input = z.input<typeof overtimeReimbursementFormSchema>;
type Output = z.output<typeof overtimeReimbursementFormSchema>;

/**
 * Reimburse Overtime (2026-10-30): pengajuan terpisah berisi sesi overtime yang sudah disetujui Ko Yosep. Satu sesi =
 * satu baris tipe Overtime; nominal diisi approver (Ci Ika) saat menyetujui.
 */
export function OvertimeReimbursementForm({
  reimbursementId,
  defaultValues,
  overtimes,
}: {
  reimbursementId: string | null;
  defaultValues: Input;
  overtimes: OvertimeRow[];
}) {
  const router = useRouter();
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(overtimeReimbursementFormSchema), defaultValues });
  const { serverError, pending, submit } = useActionSubmit(form);
  useUnsavedChangesGuard(form.formState.isDirty);
  const { notify } = useFeedback();
  const selectError = form.formState.errors.overtimeIds?.message ?? form.formState.errors.overtimeIds?.root?.message;

  const save = (andSubmit: boolean) =>
    form.handleSubmit((values) =>
      submit(
        () => saveReimbursementAction(reimbursementId, values, andSubmit),
        (data) => {
          notify(andSubmit ? "Reimburse overtime diajukan" : "Draft reimburse overtime tersimpan");
          router.push(`/reimburse/${data.reimbursementId}`);
        },
      ),
    );

  return (
    <FormProvider {...form}>
      <form onSubmit={save(true)} noValidate className="flex flex-col gap-6">
        <FormAlert message={serverError ?? selectError ?? null} />
        <section className="rounded-2xl bg-card shadow-card" aria-labelledby="overtime-heading">
          <div className="flex flex-col gap-1 border-b border-border p-5">
            <h2 id="overtime-heading" className="flex items-center gap-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
              <Timer className="size-4" aria-hidden /> Overtime disetujui
            </h2>
            <p className="text-sm text-muted-foreground">Centang overtime yang mau di-reimburse. Nominal diisi approver saat menyetujui.</p>
          </div>
          {overtimes.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              Belum ada overtime yang disetujui dan belum di-reimburse.{" "}
              <Link href="/overtime" className="font-semibold text-primary hover:underline">
                Lihat status overtime
              </Link>
            </p>
          ) : (
            <Controller
              control={form.control}
              name="overtimeIds"
              render={({ field }) => {
                const selected: string[] = Array.isArray(field.value) ? field.value : [];
                return (
                  <ul className="flex flex-col divide-y divide-border">
                    {overtimes.map((o) => (
                      <li key={o.id}>
                        <label className="flex cursor-pointer items-start gap-3 p-5">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-primary"
                            checked={selected.includes(o.id)}
                            onChange={(event) => field.onChange(event.target.checked ? [...selected, o.id] : selected.filter((id) => id !== o.id))}
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                            <span className="font-semibold">
                              {formatDate(`${o.date}T00:00:00Z`, "weekday")} · {o.clockIn}–{o.clockOut}
                              {o.clockOutDate && ` (${formatDate(`${o.clockOutDate}T00:00:00Z`, "short")})`} · {formatDuration(o.minutes)}
                              {o.weekend && <span className="ml-2 text-xs font-medium text-muted-foreground">Weekend / libur</span>}
                            </span>
                            <span className="text-muted-foreground">
                              {o.customerName} · {o.projectName}
                            </span>
                            <span className="text-muted-foreground">{o.activity}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">{o.number}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                );
              }}
            />
          )}
        </section>

        <section className="rounded-2xl bg-card p-5 shadow-card">
          <TextareaField name="note" label="Catatan untuk approver (opsional)" />
        </section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" disabled={pending} onClick={save(false)}>
            Simpan Draft
          </Button>
          <Button type="submit" size="lg" disabled={pending || overtimes.length === 0}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            Ajukan
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
