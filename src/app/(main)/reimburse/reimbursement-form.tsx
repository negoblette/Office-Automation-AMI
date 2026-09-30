"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form";
import type { z } from "zod";
import { DateInputField, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FileUpload } from "@/components/form/file-upload";
import { FormAlert } from "@/components/form/form-actions";
import { FormField } from "@/components/form/form-field";
import { RupiahInput } from "@/components/form/rupiah-input";
import { SelectField } from "@/components/form/select-field";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { Button } from "@/components/ui/button";
import { formatRupiah, toJakartaIsoDate } from "@/lib/format";
import { PAYMENT_METHOD_LABEL, toOptions } from "@/lib/labels";
import type { ReimbursementFormOptions } from "@/lib/services/reimbursement-queries";
import { cn } from "@/lib/utils";
import { reimbursementSchema, reimbursementTotals } from "@/lib/validators/reimbursement";
import { saveReimbursementAction } from "./actions";
import { emptyItem } from "./form-defaults";

type Input = z.input<typeof reimbursementSchema>;
type Output = z.output<typeof reimbursementSchema>;
const NO_PROJECT = "__none__";

/** Form reimburse multi-baris (URD RMB-02..06). */
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
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(reimbursementSchema), defaultValues });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const { serverError, pending, submit } = useActionSubmit(form);

  const items = useWatch({ control: form.control, name: "items" }) ?? [];
  const totals = reimbursementTotals(items.map((item) => ({ paymentMethod: String(item.paymentMethod), amount: item.amount as number })));

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
        <FormAlert message={serverError} />
        <datalist id="customer-options">
          {options.customers.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        {options.types.length === 0 && (
          <FormAlert message="Belum ada tipe reimburse untuk divisi Anda. Hubungi Admin." />
        )}

        {fields.map((field, index) => (
          <ItemCard key={field.id} index={index} options={options} canRemove={fields.length > 1} onRemove={() => remove(index)} />
        ))}

        <Button type="button" variant="outline" onClick={() => append(emptyItem())} className="w-fit" disabled={fields.length >= 50}>
          <Plus aria-hidden /> Tambah Baris
        </Button>

        <section className="grid gap-4 rounded-2xl bg-card p-5 shadow-card sm:grid-cols-[1fr_auto]">
          <TextareaField name="note" label="Catatan untuk approver (opsional)" />
          <dl className="grid min-w-64 content-start gap-2 text-sm">
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

function ItemCard({
  index,
  options,
  canRemove,
  onRemove,
}: {
  index: number;
  options: ReimbursementFormOptions;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const form = useFormContextTyped();
  const name = (field: string) => `items.${index}.${field}`;
  const errors = form.formState.errors.items?.[index];
  const hasReceipt = useWatch({ control: form.control, name: `items.${index}.hasReceipt` });

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Baris {index + 1}</h2>
        {canRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 aria-hidden /> Hapus baris
          </Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DateInputField name={name("date")} label="Tanggal" required max={toJakartaIsoDate()} />
        <SelectInputField name={name("typeId")} label="Tipe" required options={options.types} hint="Parkir → Allowance · Bensin & tol → Transport" />
        <SelectInputField name={name("paymentMethod")} label="Payment" required options={toOptions(PAYMENT_METHOD_LABEL)} />
        <FormField label="Total" htmlFor={name("amount")} required error={errors?.amount?.message}>
          <Controller
            control={form.control}
            name={`items.${index}.amount`}
            render={({ field }) => (
              <RupiahInput id={name("amount")} value={field.value as number | null} onChange={field.onChange} onBlur={field.onBlur} aria-invalid={errors?.amount ? true : undefined} />
            )}
          />
        </FormField>

        <TextInputField name={name("customerName")} label="Company / Customer" list="customer-options" placeholder="Pilih atau ketik baru" autoComplete="off" />
        <FormField label="Project" htmlFor={name("projectId")} hint={options.projects.length ? undefined : "Belum ada project aktif"}>
          <Controller
            control={form.control}
            name={`items.${index}.projectId`}
            render={({ field }) => (
              <SelectField
                id={name("projectId")}
                options={[{ value: NO_PROJECT, label: "Tanpa project" }, ...options.projects]}
                value={(field.value as string) || NO_PROJECT}
                onChange={(value) => field.onChange(value === NO_PROJECT || !value ? "" : value)}
                disabled={options.projects.length === 0}
              />
            )}
          />
        </FormField>
        <TextInputField name={name("location")} label="Lokasi" required className="lg:col-span-2" />

        <TextInputField name={name("activity")} label="Aktivitas / Project" required className="sm:col-span-2" />
        <TextareaField name={name("participants")} label="Names – Position" required className="sm:col-span-2" placeholder={"Budi – Manager IT\nSari – Staff Procurement"} />

        <FormField label="Kwitansi" htmlFor={name("hasReceipt")} className="sm:col-span-2 lg:col-span-4" error={errors?.receiptFileKey?.message}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Controller
              control={form.control}
              name={`items.${index}.hasReceipt`}
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
                      className={cn(
                        "rounded-md px-4 py-1.5 text-sm font-medium",
                        field.value === option.value ? "bg-background shadow-sm" : "text-muted-foreground",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            />
            {hasReceipt && (
              <Controller
                control={form.control}
                name={`items.${index}.receiptFileKey`}
                render={({ field }) => {
                  const fileName = form.getValues(`items.${index}.receiptFileName`) as string;
                  return (
                    <FileUpload
                      compact
                      className="flex-1"
                      value={field.value ? { key: String(field.value), fileName: fileName || "kwitansi", mimeType: "", sizeBytes: 0 } : null}
                      onChange={(file) => {
                        field.onChange(file?.key ?? "");
                        form.setValue(`items.${index}.receiptFileName`, file?.fileName ?? "");
                      }}
                    />
                  );
                }}
              />
            )}
          </div>
        </FormField>
      </div>
    </section>
  );
}

/** useFormContext bertipe untuk form ini. */
function useFormContextTyped() {
  return useFormContext<Input, unknown, Output>();
}
