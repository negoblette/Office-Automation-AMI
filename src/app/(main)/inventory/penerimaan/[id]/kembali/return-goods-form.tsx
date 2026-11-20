"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileCheckCorner, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";
import { DateInputField, FormSection, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import type { SelectOption } from "@/components/form/select-field";
import { useUnsavedChangesGuard } from "@/components/form/unsaved-changes";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { useFeedback } from "@/components/shared/feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { goodsReturnSchema } from "@/lib/validators/goods-receipt";
import { returnGoodsAction } from "../../actions";

type FormInput = z.input<typeof goodsReturnSchema>;
type FormOutput = z.output<typeof goodsReturnSchema>;

/** Unit penerimaan yang masih di AMI; `busy` = sedang dipakai (tidak bisa dikembalikan dulu). */
export type ReturnableUnit = { id: string; deviceName: string; serialNo: string; location: string | null; busy: string | null };

/**
 * Kembalikan barang ke principal / distributor (2026-11-20, Operational): pilih unit (boleh sebagian), tanggal, kontak,
 * yang menyerahkan dari AMI, penerima di principal (opsional), catatan. Simpan → HAF pengembalian terbit (lalu dicetak),
 * unit keluar dari Daftar Unit. Dicek ulang di server.
 */
export function ReturnGoodsForm({ receiptId, ownerName, units, employees, defaultValues, minDate, today }: {
  receiptId: string;
  ownerName: string;
  units: ReturnableUnit[];
  employees: SelectOption[];
  defaultValues: FormInput;
  minDate: string;
  today: string;
}) {
  const router = useRouter();
  const { notify } = useFeedback();
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(goodsReturnSchema), defaultValues });
  const { serverError, pending, submit } = useActionSubmit(form);
  useUnsavedChangesGuard(form.formState.isDirty);
  const [incomplete, setIncomplete] = useState(false);
  const available = units.filter((unit) => !unit.busy);

  const onSubmit = form.handleSubmit(
    (values) => {
      setIncomplete(false);
      submit(
        () => returnGoodsAction(receiptId, values),
        (data) => {
          notify(`Pengembalian tercatat — HAF ${data.hafNumber} siap dicetak`);
          router.push(`/inventory/penerimaan/${receiptId}`);
        },
      );
    },
    () => setIncomplete(true),
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <FormAlert message={serverError} />
        <div className="flex flex-col gap-[26px] rounded-2xl bg-card p-5 shadow-card sm:p-6">
          <FormSection title="Unit yang dikembalikan" description={`Pilih unit yang diserahkan kembali ke ${ownerName}. Boleh sebagian; sisanya bisa dikembalikan nanti.`}>
            <Controller
              control={form.control}
              name="assetIds"
              render={({ field, fieldState }) => {
                const selected: string[] = Array.isArray(field.value) ? field.value : [];
                const toggle = (id: string, checked: boolean) => field.onChange(checked ? [...selected, id] : selected.filter((value) => value !== id));
                return (
                  <fieldset className="flex flex-col gap-2 sm:col-span-2" aria-describedby={fieldState.error ? "assetIds-error" : undefined}>
                    <legend className="mb-1 text-[13px] font-bold text-ink-2">
                      Unit ({selected.length} dipilih){" "}
                      <span className="text-red-ink" aria-hidden>
                        *
                      </span>
                    </legend>
                    {available.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onClick={() => field.onChange(selected.length === available.length ? [] : available.map((unit) => unit.id))}
                      >
                        {selected.length === available.length ? "Batalkan semua" : "Pilih semua yang bisa dikembalikan"}
                      </Button>
                    )}
                    <ul className="flex flex-col divide-y divide-border rounded-[14px] shadow-[inset_0_0_0_1px_var(--edge)]">
                      {units.map((unit) => {
                        const checked = selected.includes(unit.id);
                        return (
                          <li key={unit.id}>
                            <label
                              className={cn(
                                "flex min-h-11 items-start gap-3 px-4 py-3",
                                unit.busy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/40",
                              )}
                            >
                              <input
                                type="checkbox"
                                className="mt-1 size-4 accent-brand"
                                checked={checked}
                                disabled={Boolean(unit.busy)}
                                onChange={(event) => toggle(unit.id, event.target.checked)}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block font-semibold wrap-anywhere text-ink">{unit.deviceName}</span>
                                <span className="block font-mono text-xs text-ink-3">SN {unit.serialNo}</span>
                                {unit.busy && <span className="mt-0.5 block text-xs font-semibold text-amber-deep">{unit.busy} — belum bisa dikembalikan</span>}
                              </span>
                              <span className="shrink-0 text-xs text-ink-3">{unit.location ?? "Tidak di rak"}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    {fieldState.error && (
                      <p id="assetIds-error" className="text-[12.5px] font-semibold text-red-ink">
                        {fieldState.error.message}
                      </p>
                    )}
                  </fieldset>
                );
              }}
            />
          </FormSection>

          <FormSection title="Pengembalian" description={`Tertulis di Hardware Admission Form: kepada ${ownerName} (up: kontak), tanggal, yang menyerahkan & penerimanya.`}>
            <DateInputField name="returnedDate" label="Tanggal dikembalikan" required min={minDate} max={today} />
            <TextInputField name="contactName" label="Kontak (up:)" required autoComplete="off" />
            <SelectInputField name="returnedById" label="Diserahkan oleh (Returned By)" required options={employees} placeholder="Pilih karyawan…" hint="Karyawan AMI yang mengantar / menyerahkan barang." />
            <TextInputField name="receivedByName" label={`Diterima oleh (Received By)`} autoComplete="off" hint={`Opsional. Penerima di ${ownerName}; bisa ditulis tangan di HAF.`} />
            <TextareaField name="note" label="Catatan" className="sm:col-span-2" placeholder="mis. Dikembalikan lengkap dengan kardus & aksesori" hint="Opsional. Tercetak di Remarks HAF." />
          </FormSection>
        </div>

        {incomplete && <FormAlert message="Masih ada isian yang belum lengkap. Periksa kolom yang ditandai." />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href={`/inventory/penerimaan/${receiptId}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Batal
          </Link>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <FileCheckCorner aria-hidden />}
            Simpan & Terbitkan HAF
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
