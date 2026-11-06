"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HeartPulse, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form";
import type { z } from "zod";
import { DateInputField, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { fieldDescriptionId, FormField } from "@/components/form/form-field";
import { RupiahInput } from "@/components/form/rupiah-input";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatRupiah, toJakartaIsoDate } from "@/lib/format";
import { healthClaimSchema } from "@/lib/validators/health";
import { submitHealthClaimAction } from "./actions";

type Input = z.input<typeof healthClaimSchema>;
type Output = z.output<typeof healthClaimSchema>;
type Category = { value: string; label: string };

const MAX_LINES = 50;
const emptyLine = (date: string): Input["items"][number] => ({ categoryId: "", date, amount: null as unknown as number, note: "" });

/**
 * Dialog klaim kesehatan (HC-02, HC-03; 2026-11-06): beberapa baris seperti reimburse, tanpa kunjungan — tiap baris
 * kategori, tanggal, nominal, keterangan. Total dihitung otomatis; server mengecek ulang terhadap plafon.
 */
export function HealthClaimDialog({
  categories,
  remaining,
  revise,
}: {
  categories: Category[];
  remaining: number;
  /** Revisi klaim yang ditolak (2026-10-12): nomor tetap, diajukan ulang. */
  revise?: { id: string; number: string; items: { categoryId: string; date: string; amount: number; note: string | null }[]; note: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const defaults: Input = revise
    ? { items: revise.items.map((item) => ({ categoryId: item.categoryId, date: item.date, amount: item.amount, note: item.note ?? "" })), note: revise.note ?? "" }
    : { items: [emptyLine(toJakartaIsoDate())], note: "" };
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(healthClaimSchema), defaultValues: defaults });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const { serverError, pending, submit } = useActionSubmit(form);
  const items = useWatch({ control: form.control, name: "items" }) ?? [];
  const total = items.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? Number(item.amount) : 0), 0);
  const itemsError = form.formState.errors.items?.root?.message ?? form.formState.errors.items?.message;

  const onSubmit = form.handleSubmit((values) =>
    submit(
      () => submitHealthClaimAction(values, revise?.id ?? null),
      () => {
        setOpen(false);
        router.refresh();
      },
    ),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
    >
      {revise ? (
        <DialogTrigger render={<Button size="sm" variant="outline" />}>
          <Pencil aria-hidden /> Revisi
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="lg" />}>
          <HeartPulse aria-hidden /> Ajukan Klaim
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-2xl">
        <FormProvider {...form}>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{revise ? `Revisi Klaim ${revise.number}` : "Ajukan Klaim Kesehatan"}</DialogTitle>
              <DialogDescription>Sisa plafon tahun ini {formatRupiah(remaining)}. Klaim melebihi sisa plafon tidak bisa diajukan.</DialogDescription>
            </DialogHeader>
            <FormAlert message={serverError ?? itemsError ?? null} />
            <div className="flex flex-col divide-y divide-border rounded-xl shadow-[inset_0_0_0_1px_var(--line)]">
              {fields.map((field, index) => (
                <ClaimLine key={field.id} index={index} categories={categories} canRemove={fields.length > 1} onRemove={() => remove(index)} />
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={fields.length >= MAX_LINES}
                onClick={() => append(emptyLine(String(items.at(-1)?.date || toJakartaIsoDate())))}
              >
                <Plus aria-hidden /> Tambah Baris
              </Button>
              <p className="text-sm text-muted-foreground">
                Total <span className="ml-2 font-semibold text-foreground tabular-nums">{formatRupiah(total)}</span>
              </p>
            </div>
            <TextareaField name="note" label="Catatan (opsional)" />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Batal</DialogClose>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {revise ? "Ajukan Ulang" : "Ajukan"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

/** Satu baris klaim. */
function ClaimLine({ index, categories, canRemove, onRemove }: { index: number; categories: Category[]; canRemove: boolean; onRemove: () => void }) {
  const form = useFormContext<Input, unknown, Output>();
  const error = form.formState.errors.items?.[index]?.amount?.message;
  const amountName = `items.${index}.amount`;
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Baris {index + 1}</h3>
        {canRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 aria-hidden /> Hapus baris
          </Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInputField name={`items.${index}.categoryId`} label="Kategori" required options={categories} />
        <DateInputField name={`items.${index}.date`} label="Tanggal (sesuai invoice)" required max={toJakartaIsoDate()} />
        <FormField label="Nominal" htmlFor={amountName} required error={error}>
          <Controller
            control={form.control}
            name={`items.${index}.amount`}
            render={({ field }) => (
              <RupiahInput
                id={amountName}
                value={field.value as number | null}
                onChange={field.onChange}
                onBlur={field.onBlur}
                aria-required
                aria-invalid={error ? true : undefined}
                aria-describedby={fieldDescriptionId(amountName)}
              />
            )}
          />
        </FormField>
        <TextInputField name={`items.${index}.note`} label="Keterangan" />
      </div>
    </div>
  );
}
