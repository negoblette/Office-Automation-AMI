"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form";
import type { z } from "zod";
import { DateInputField, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { FormField } from "@/components/form/form-field";
import { RupiahInput } from "@/components/form/rupiah-input";
import { SelectField } from "@/components/form/select-field";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { Button } from "@/components/ui/button";
import { formatDate, formatRupiah, toJakartaIsoDate } from "@/lib/format";
import { PAYMENT_METHOD_LABEL, toOptions } from "@/lib/labels";
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
}: {
  reimbursementId: string | null;
  defaultValues: Input;
  options: ReimbursementFormOptions;
}) {
  const router = useRouter();
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(reimbursementFormSchema), defaultValues });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "visits" });
  const { serverError, pending, submit } = useActionSubmit(form);

  const visits = useWatch({ control: form.control, name: "visits" }) ?? [];
  const lines = visits.flatMap((visit) => (visit.lines ?? []).map((line) => ({ ...line, date: String(visit.date ?? "") })));
  const totals = reimbursementTotals(lines.map((line) => ({ paymentMethod: String(line.paymentMethod), amount: line.amount as number })));
  const perDay = dailySubtotals(lines.map((line) => ({ date: line.date, amount: line.amount as number })));
  const lineCount = lines.length;
  const visitsError = form.formState.errors.visits?.root?.message ?? form.formState.errors.visits?.message;

  const save = (andSubmit: boolean) =>
    form.handleSubmit((values) =>
      submit(
        () => saveReimbursementAction(reimbursementId, values, andSubmit),
        (data) => router.push(`/reimburse/${data.reimbursementId}`),
      ),
    );

  return (
    <FormProvider {...form}>
      <form onSubmit={save(true)} noValidate className="flex flex-col gap-6">
        <FormAlert message={serverError ?? visitsError ?? null} />
        {options.types.length === 0 && <FormAlert message="Belum ada tipe reimburse untuk divisi Anda. Hubungi Admin." />}
        

        {fields.map((field, index) => (
          <VisitCard
            key={field.id}
            index={index}
            options={options}
            canRemove={fields.length > 1}
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

        <section className="grid gap-4 rounded-2xl bg-card p-5 shadow-card sm:grid-cols-[1fr_auto]">
          <TextareaField name="note" label="Catatan untuk approver (opsional)" />
          <dl className="grid min-w-64 content-start gap-2 text-sm">
            {perDay.length > 1 &&
              perDay.map((day) => <Total key={day.date} label={`Subtotal ${formatDate(`${day.date}T00:00:00Z`, "short")}`} value={day.amount} />)}
            {perDay.length > 1 && <div className="border-t border-border" />}
            <Total label="Subtotal Cash" value={totals.cash} />
            <Total label="Subtotal Kartu Kredit" value={totals.cc} />
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
                  aria-invalid={errors?.customerId ? true : undefined}
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
              <RupiahInput id={name("amount")} value={field.value as number | null} onChange={field.onChange} onBlur={field.onBlur} aria-invalid={errors?.amount ? true : undefined} />
            )}
          />
        </FormField>
        <TextInputField name={name("location")} label="Lokasi" required />

        <TextareaField name={name("participants")} label="Names – Position" required className="sm:col-span-2" placeholder={"Budi – Manager IT\nSari – Staff Procurement"} />
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

/** useFormContext bertipe untuk form ini. */
function useFormContextTyped() {
  return useFormContext<Input, unknown, Output>();
}
