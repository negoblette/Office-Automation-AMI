"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Loader2, Plus, Send, Timer, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form";
import type { z } from "zod";
import { DateInputField, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { fieldDescriptionId, FormField } from "@/components/form/form-field";
import { RupiahInput } from "@/components/form/rupiah-input";
import { SelectField } from "@/components/form/select-field";
import { DraftNotice, useFormDraft, useUnsavedChangesGuard } from "@/components/form/unsaved-changes";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { useFeedback } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/attendance";
import { formatDate, formatRupiah, toJakartaIsoDate } from "@/lib/format";
import { PAYMENT_METHOD_LABEL, toOptions } from "@/lib/labels";
import type { ReimbursableOvertime } from "@/lib/services/overtime-queries";
import type { ReimbursementFormOptions } from "@/lib/services/reimbursement-queries";
import { cn } from "@/lib/utils";
import { dailySubtotals, NEW_ACQUISITION, reimbursementFormSchema, reimbursementTotals } from "@/lib/validators/reimbursement";
import { CustomerDialog, ProjectDialog } from "../project/project-dialogs";
import { saveReimbursementAction } from "./actions";
import { emptyLine, emptyVisit } from "./form-defaults";

type Input = z.input<typeof reimbursementFormSchema>;
type Output = z.output<typeof reimbursementFormSchema>;
const NO_PROJECT = "__none__";
const MAX_LINES = 50;

/**
 * Form reimburse (URD RMB-02..06, Fase 14): beberapa kunjungan (tanggal + company + project /
 * New Acquisition), masing-masing berisi beberapa baris transaksi. Subtotal per tanggal bila
 * tanggalnya berbeda.
 */
export function ReimbursementForm({
  reimbursementId,
  defaultValues,
  options,
  draftKey,
  overtime = null,
}: {
  reimbursementId: string | null;
  defaultValues: Input;
  options: ReimbursementFormOptions;
  /** Kunci draft sementara (sessionStorage), unik per user + pengajuan. */
  draftKey: string;
  /** Overtime yang bisa di-reimburse (divisi Engineer, 2026-10-30); null = bagian Overtime tidak tampil. */
  overtime?: { rate: number; overtimes: ReimbursableOvertime[] } | null;
}) {
  const router = useRouter();
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(reimbursementFormSchema), defaultValues });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "visits" });
  const { serverError, pending, submit } = useActionSubmit(form);
  // Audit UI 2026-10-27: form panjang — tanya sebelum ditinggal, dan isian tersimpan sementara di tab ini.
  // Pindah halaman setelah simpan memakai router.push (bukan klik link), jadi tidak ikut ditahan.
  useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form, draftKey);
  const { notify } = useFeedback();

  const visits = useWatch({ control: form.control, name: "visits" }) ?? [];
  const overtimeIds = useWatch({ control: form.control, name: "overtimeIds" }) ?? [];
  // Overtime terpilih ikut subtotal sebagai baris Personal (nominal final dihitung server).
  const overtimeLines = (overtime?.overtimes ?? [])
    .filter((o) => overtimeIds.includes(o.id))
    .map((o) => ({ date: o.date, paymentMethod: "PERSONAL", amount: o.amount }));
  const lines = [
    ...visits.flatMap((visit) => (visit.lines ?? []).map((line) => ({ ...line, date: String(visit.date ?? "") }))),
    ...overtimeLines,
  ];
  const totals = reimbursementTotals(lines.map((line) => ({ paymentMethod: String(line.paymentMethod), amount: line.amount as number })));
  const perDay = dailySubtotals(lines.map((line) => ({ date: line.date, amount: line.amount as number })));
  const lineCount = lines.length;
  const visitsError = form.formState.errors.visits?.root?.message ?? form.formState.errors.visits?.message;

  const save = (andSubmit: boolean) =>
    form.handleSubmit((values) =>
      submit(
        () => saveReimbursementAction(reimbursementId, values, andSubmit),
        (data) => {
          draft.clear();
          notify(andSubmit ? "Reimburse diajukan" : "Draft reimburse tersimpan");
          router.push(`/reimburse/${data.reimbursementId}`);
        },
      ),
    );

  return (
    <FormProvider {...form}>
      <form onSubmit={save(true)} noValidate className="flex flex-col gap-6">
        {draft.pendingDraft && <DraftNotice savedAt={draft.pendingDraft.savedAt} onRestore={draft.restore} onDiscard={draft.discard} />}
        <FormAlert message={serverError ?? visitsError ?? null} />
        {options.types.length === 0 && <FormAlert message="Belum ada tipe reimburse untuk divisi Anda. Hubungi Admin." />}
        

        {fields.map((field, index) => (
          <VisitCard
            key={field.id}
            index={index}
            options={options}
            canRemove={fields.length > 1 || overtimeIds.length > 0}
            canAddLine={lineCount < MAX_LINES}
            onRemove={() => remove(index)}
          />
        ))}

        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={lineCount >= MAX_LINES}
          onClick={() => append(emptyVisit(String(visits.at(-1)?.date || toJakartaIsoDate())))}
        >
          <Building2 aria-hidden /> Tambah Kunjungan
        </Button>

        {overtime && <OvertimePicker rate={overtime.rate} overtimes={overtime.overtimes} canAdd={lineCount < MAX_LINES} />}

        <section className="grid gap-4 rounded-2xl bg-card p-5 shadow-card sm:grid-cols-[1fr_auto]">
          <TextareaField name="note" label="Catatan untuk approver (opsional)" />
          <dl className="grid min-w-64 content-start gap-2 text-sm">
            {perDay.length > 1 &&
              perDay.map((day) => <Total key={day.date} label={`Subtotal ${formatDate(`${day.date}T00:00:00Z`, "short")}`} value={day.amount} />)}
            {perDay.length > 1 && <div className="border-t border-border" />}
            <Total label="Subtotal Personal" value={totals.personal} />
            <Total label="Subtotal Corporate" value={totals.corporate} />
            <Total label="Total" value={totals.total} strong />
          </dl>
        </section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" disabled={pending} onClick={save(false)}>
            Simpan Draft
          </Button>
          <Button type="submit" size="lg" disabled={pending || options.types.length === 0}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            Ajukan
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-6", strong && "border-t border-border pt-2 text-base font-bold")}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums">{formatRupiah(value)}</dd>
    </div>
  );
}

/** Header kunjungan: tanggal → company (master) → project milik company / New Acquisition. */
function VisitCard({
  index,
  options,
  canRemove,
  canAddLine,
  onRemove,
}: {
  index: number;
  options: ReimbursementFormOptions;
  canRemove: boolean;
  canAddLine: boolean;
  onRemove: () => void;
}) {
  const form = useFormContextTyped();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: `visits.${index}.lines` });
  const errors = form.formState.errors.visits?.[index];
  const customerId = useWatch({ control: form.control, name: `visits.${index}.customerId` });
  const visitLines = useWatch({ control: form.control, name: `visits.${index}.lines` }) ?? [];
  const subtotal = reimbursementTotals(visitLines.map((line) => ({ paymentMethod: String(line.paymentMethod), amount: line.amount as number }))).total;
  const companyProjects = useMemo(() => (customerId ? options.projects.filter((p) => p.customerId === customerId) : []), [customerId, options.projects]);
  const projectOptions = [
    { value: NO_PROJECT, label: "Tanpa project" },
    { value: NEW_ACQUISITION, label: "New Acquisition (prospek)" },
    ...companyProjects,
  ];

  return (
    <section className="rounded-2xl bg-card shadow-card">
      <div className="flex flex-col gap-4 border-b border-border p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Kunjungan {index + 1}</h2>
          {canRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              <Trash2 aria-hidden /> Hapus kunjungan
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,11rem)_1fr_1fr]">
          <DateInputField name={`visits.${index}.date`} label="Tanggal" required max={toJakartaIsoDate()} />
          <FormField label="Company / Customer" htmlFor={`visits.${index}.customerId`} required error={errors?.customerId?.message}>
            <Controller
              control={form.control}
              name={`visits.${index}.customerId`}
              render={({ field }) => (
                <SelectField
                  id={`visits.${index}.customerId`}
                  options={options.customers}
                  value={field.value || null}
                  placeholder="Pilih company…"
                  aria-required
                  aria-invalid={errors?.customerId ? true : undefined}
                  aria-describedby={fieldDescriptionId(`visits.${index}.customerId`)}
                  onChange={(value) => {
                    // Ganti company → pilihan project direset (project lama milik company lain).
                    if ((value ?? "") !== field.value) form.setValue(`visits.${index}.project`, "");
                    field.onChange(value ?? "");
                  }}
                />
              )}
            />
          </FormField>
          <FormField
            label="ID - Nama Project"
            htmlFor={`visits.${index}.project`}
            hint={!customerId ? "Pilih company dulu" : companyProjects.length ? undefined : "Company ini belum punya project aktif"}
            error={errors?.project?.message}
          >
            <Controller
              control={form.control}
              name={`visits.${index}.project`}
              render={({ field }) => (
                <SelectField
                  id={`visits.${index}.project`}
                  options={projectOptions}
                  value={field.value || NO_PROJECT}
                  onChange={(value) => field.onChange(value === NO_PROJECT || !value ? "" : value)}
                  disabled={!customerId}
                />
              )}
            />
          </FormField>
        </div>
        {options.canAddMaster ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>Company / project belum ada?</span>
            <CustomerDialog
              trigger={
                <Button type="button" variant="link" size="sm" className="h-auto px-0">
                  <Plus aria-hidden /> Customer baru
                </Button>
              }
              onCreated={(id) => {
                form.setValue(`visits.${index}.customerId`, id, { shouldValidate: true });
                form.setValue(`visits.${index}.project`, "");
              }}
            />
            <span aria-hidden>·</span>
            <ProjectDialog
              customers={options.customers}
              customerId={customerId || undefined}
              suggestedCode={options.suggestedProjectCode}
              canSetActive={false}
              trigger={
                <Button type="button" variant="link" size="sm" className="h-auto px-0">
                  <Plus aria-hidden /> Project baru
                </Button>
              }
              onCreated={(project) => {
                form.setValue(`visits.${index}.customerId`, project.customerId, { shouldValidate: true });
                form.setValue(`visits.${index}.project`, project.id);
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Company / project belum ada? Hubungi tim Sales atau Admin untuk menambahkannya.</p>
        )}
        {errors?.lines?.root?.message && <p className="text-sm text-danger">{errors.lines.root.message}</p>}
      </div>

      <div className="flex flex-col divide-y divide-border">
        {fields.map((field, lineIndex) => (
          <LineRow key={field.id} visitIndex={index} index={lineIndex} options={options} canRemove={fields.length > 1} onRemove={() => remove(lineIndex)} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-5">
        <Button type="button" variant="outline" size="sm" disabled={!canAddLine} onClick={() => append(emptyLine())}>
          <Plus aria-hidden /> Tambah Baris
        </Button>
        <p className="text-sm text-muted-foreground">
          Subtotal kunjungan <span className="ml-2 font-semibold text-foreground tabular-nums">{formatRupiah(subtotal)}</span>
        </p>
      </div>
    </section>
  );
}

/** Satu baris transaksi di dalam kunjungan. */
function LineRow({
  visitIndex,
  index,
  options,
  canRemove,
  onRemove,
}: {
  visitIndex: number;
  index: number;
  options: ReimbursementFormOptions;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const form = useFormContextTyped();
  const base = `visits.${visitIndex}.lines.${index}` as const;
  const name = (field: string) => `${base}.${field}`;
  const errors = form.formState.errors.visits?.[visitIndex]?.lines?.[index];
  // Names – Position wajib kecuali tipe Transport (2026-10-12).
  const typeId = useWatch({ control: form.control, name: `${base}.typeId` });
  const participantsRequired = options.types.find((t) => t.value === typeId)?.code !== "TRANSPORT";

  return (
    <div className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Baris {index + 1}</h3>
        {canRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 aria-hidden /> Hapus baris
          </Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectInputField name={name("typeId")} label="Tipe" required options={options.types} hint="Parkir & training → Allowance · Bensin & tol → Transport" />
        <SelectInputField name={name("paymentMethod")} label="Payment" required options={toOptions(PAYMENT_METHOD_LABEL)} />
        <FormField label="Total" htmlFor={name("amount")} required error={errors?.amount?.message}>
          <Controller
            control={form.control}
            name={`${base}.amount`}
            render={({ field }) => (
              <RupiahInput
                id={name("amount")}
                value={field.value as number | null}
                onChange={field.onChange}
                onBlur={field.onBlur}
                aria-required
                aria-invalid={errors?.amount ? true : undefined}
                aria-describedby={fieldDescriptionId(name("amount"))}
              />
            )}
          />
        </FormField>
        <TextInputField name={name("location")} label="Lokasi" required />

        <TextareaField
          name={name("participants")}
          label="Names – Position"
          required={participantsRequired}
          hint={participantsRequired ? undefined : "Opsional untuk tipe Transport"}
          className="sm:col-span-2"
          placeholder={"Budi – Manager IT\nSari – Staff Procurement"}
        />
        <TextInputField name={name("activity")} label="Aktivitas" required className="sm:col-span-2" />

        <FormField label="Ada kwitansi fisik?" htmlFor={name("hasReceipt")} className="sm:col-span-2 lg:col-span-4">
          <Controller
            control={form.control}
            name={`${base}.hasReceipt`}
            render={({ field }) => (
              <div role="radiogroup" aria-label="Ada kwitansi?" className="inline-flex w-fit rounded-lg bg-muted p-1">
                {[
                  { value: true, label: "Ya" },
                  { value: false, label: "Tidak" },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={field.value === option.value}
                    onClick={() => field.onChange(option.value)}
                    className={cn("rounded-md px-4 py-1.5 text-sm font-medium", field.value === option.value ? "bg-background shadow-sm" : "text-muted-foreground")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          />
        </FormField>
      </div>
    </div>
  );
}

/**
 * Pilihan overtime (2026-10-30): centang sesi overtime yang sudah selesai; satu sesi = satu baris reimburse tipe
 * Overtime dengan tanggal, customer, project & pekerjaan dari sesi itu. Nominal = durasi × tarif per jam.
 */
function OvertimePicker({ rate, overtimes, canAdd }: { rate: number; overtimes: ReimbursableOvertime[]; canAdd: boolean }) {
  const form = useFormContextTyped();
  return (
    <section className="rounded-2xl bg-card shadow-card" aria-labelledby="overtime-heading">
      <div className="flex flex-col gap-1 border-b border-border p-5">
        <h2 id="overtime-heading" className="flex items-center gap-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          <Timer className="size-4" aria-hidden /> Overtime
        </h2>
        <p className="text-sm text-muted-foreground">
          {rate
            ? `Centang overtime yang mau di-reimburse. Nominal = durasi × ${formatRupiah(rate)} per jam.`
            : "Tarif overtime per jam belum diatur Admin — overtime belum bisa di-reimburse."}
        </p>
      </div>
      {overtimes.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">Belum ada overtime selesai yang bisa di-reimburse.</p>
      ) : (
        <Controller
          control={form.control}
          name="overtimeIds"
          render={({ field }) => {
            const selected: string[] = Array.isArray(field.value) ? field.value : [];
            return (
              <ul className="flex flex-col divide-y divide-border">
                {overtimes.map((o) => {
                  const checked = selected.includes(o.id);
                  return (
                    <li key={o.id}>
                      <label className={cn("flex cursor-pointer items-start gap-3 p-5", !rate && "cursor-not-allowed opacity-60")}>
                        <input
                          type="checkbox"
                          className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-primary"
                          checked={checked}
                          disabled={!rate || (!checked && !canAdd)}
                          onChange={(event) => field.onChange(event.target.checked ? [...selected, o.id] : selected.filter((id) => id !== o.id))}
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                          <span className="font-semibold">
                            {formatDate(`${o.date}T00:00:00Z`, "weekday")} · {o.clockIn}–{o.clockOut}
                            {o.clockOutDate && ` (${formatDate(`${o.clockOutDate}T00:00:00Z`, "short")})`} · {formatDuration(o.minutes)}
                          </span>
                          <span className="text-muted-foreground">
                            {o.customerName} · {o.projectName}
                          </span>
                          <span className="text-muted-foreground">{o.activity}</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatRupiah(o.amount)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            );
          }}
        />
      )}
    </section>
  );
}

/** useFormContext bertipe untuk form ini. */
function useFormContextTyped() {
  return useFormContext<Input, unknown, Output>();
}
