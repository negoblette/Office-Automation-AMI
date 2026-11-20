"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardCheck, Loader2, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form";
import type { z } from "zod";
import { DateInputField, FormSection, TextareaField, TextInputField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { fieldDescriptionId, FormField } from "@/components/form/form-field";
import { SelectField } from "@/components/form/select-field";
import { useUnsavedChangesGuard } from "@/components/form/unsaved-changes";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { useFeedback } from "@/components/shared/feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ReturnCondition } from "@/generated/prisma/enums";
import { RETURN_CONDITION_LABEL } from "@/lib/demo-loan";
import { rackPositions, rackRangeLabel } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { returnDemoLoanSchema } from "@/lib/validators/demo-loan";
import type { RackOption } from "../../../asset-dialogs";
import { returnDemoLoanAction } from "../../actions";

type FormInput = z.input<typeof returnDemoLoanSchema>;
type FormOutput = z.output<typeof returnDemoLoanSchema>;

export type ReturnUnit = { itemId: string; deviceName: string; serialNo: string; originalLocation: string | null };

const CONDITIONS: ReturnCondition[] = ["GOOD", "DAMAGED", "INCOMPLETE"];
const CONDITION_STYLE: Record<ReturnCondition, string> = {
  GOOD: "bg-green-soft text-green-deep shadow-[inset_0_0_0_2px_var(--green-deep)]",
  DAMAGED: "bg-red-soft text-red-deep shadow-[inset_0_0_0_2px_var(--red)]",
  INCOMPLETE: "bg-amber-soft text-amber-deep shadow-[inset_0_0_0_2px_var(--amber)]",
};
const NO_RACK = "__none__";

/**
 * Pengecekan Unit (Tahap 16.5, revisi 2026-11-19 — setelah barang diambil kurir & tiba di AMI, kembali sepenuhnya):
 * tanggal tiba, siapa yang menyerahkan di peminjam (opsional, sesuai HAF), lalu cek setiap unit — kondisi (wajib dipilih),
 * catatan (wajib bila Rusak / Tidak lengkap), posisi rak tempat ditaruh (bawaan: posisi semula). Simpan → Menunggu
 * verifikasi engineer (approval, 2026-11-20), lalu Selesai atau Perlu Tindak Lanjut. Dicek ulang di server.
 */
export function ReturnForm({
  loanId,
  units,
  racks,
  defaultValues,
  pickupDate,
  today,
}: {
  loanId: string;
  units: ReturnUnit[];
  racks: RackOption[];
  defaultValues: FormInput;
  /** Tanggal pengambilan di HAF — tanggal tiba tidak boleh sebelumnya. */
  pickupDate: string | null;
  today: string;
}) {
  const router = useRouter();
  const { notify } = useFeedback();
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(returnDemoLoanSchema), defaultValues });
  const { fields } = useFieldArray({ control: form.control, name: "items" });
  const { serverError, pending, submit } = useActionSubmit(form);
  // Unit Rusak / Tidak lengkap → peminjaman berstatus Perlu Tindak Lanjut (2026-11-20).
  const checked = useWatch({ control: form.control, name: "items" }) as { condition?: string }[] | undefined;
  const flagged = (checked ?? []).filter((item) => item?.condition === "DAMAGED" || item?.condition === "INCOMPLETE").length;
  useUnsavedChangesGuard(form.formState.isDirty);
  const [incomplete, setIncomplete] = useState(false);

  const onSubmit = form.handleSubmit(
    (values) => {
      setIncomplete(false);
      submit(
        () => returnDemoLoanAction(loanId, values),
        (data) => {
          notify(
            data.status === "RETURN_REVIEW"
              ? "Pengecekan tersimpan — menunggu verifikasi engineer"
              : data.status === "FOLLOW_UP"
                ? "Pengecekan tersimpan — perlu tindak lanjut, PIC & Operational sudah diberi tahu"
                : "Pengecekan unit tersimpan — peminjaman selesai",
            data.status === "RETURNED" ? "success" : "info",
          );
          router.push(`/inventory/peminjaman/${loanId}`);
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
          <FormSection title="Barang tiba di AMI" description="Kapan barang tiba, dan siapa yang menyerahkannya di peminjam (sesuai tanda tangan Returned By di HAF).">
            <DateInputField name="returnedAt" label="Tanggal tiba" required min={pickupDate ?? undefined} max={today} />
            <TextInputField name="returnedByName" label="Diserahkan oleh (Returned By)" placeholder="mis. Bapak Surahman" autoComplete="off" hint="Opsional." />
          </FormSection>

          <FormSection title={`Cek unit (${units.length})`} description="Periksa setiap unit, lalu taruh kembali di rak.">
            <ol className="flex flex-col gap-4 sm:col-span-2">
              {fields.map((field, index) => (
                <UnitCheck key={field.id} index={index} unit={units[index]} racks={racks} />
              ))}
            </ol>
          </FormSection>

          <FormSection title="Catatan" description="Opsional — mis. kelengkapan kardus, aksesori.">
            <TextareaField name="note" label="Catatan umum" className="sm:col-span-2" />
          </FormSection>
        </div>

        {flagged > 0 && (
          <p role="status" className="rounded-2xl bg-amber-soft px-5 py-4 text-sm text-amber-deep">
            <span className="font-semibold">{flagged} unit rusak / tidak lengkap.</span> Setelah hasil cek diverifikasi engineer, peminjaman
            berstatus Perlu Tindak Lanjut (belum Selesai), unit tersebut tertahan, dan PIC & Operational diberi tahu lewat email & lonceng.
          </p>
        )}
        {incomplete && <FormAlert message="Masih ada unit yang belum dicek atau isian yang kurang. Periksa kolom yang ditandai." />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href={`/inventory/peminjaman/${loanId}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Batal
          </Link>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ClipboardCheck aria-hidden />}
            Simpan & Ajukan Verifikasi
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

/** Satu unit: kondisi (pilihan berwarna, radio asli), catatan, rak & posisi tempat ditaruh kembali. */
function UnitCheck({ index, unit, racks }: { index: number; unit: ReturnUnit; racks: RackOption[] }) {
  const { control, formState, setValue } = useFormContext<FormInput, unknown, FormOutput>();
  const base = `items.${index}` as const;
  const errors = formState.errors.items?.[index];
  const condition = useWatch({ control, name: `${base}.condition` }) as ReturnCondition | "" | undefined;
  const rackId = useWatch({ control, name: `${base}.rackId` }) as string | null | undefined;
  const position = useWatch({ control, name: `${base}.rackPosition` }) as string | null | undefined;
  const rack = racks.find((r) => r.id === rackId);
  const positions = useMemo(() => (rack ? rackPositions(rack.columns, rack.rows) : []), [rack]);

  // Ganti rak → posisi lama dikosongkan bila tidak ada di rak baru.
  useEffect(() => {
    if (position && !positions.includes(position)) setValue(`${base}.rackPosition`, "", { shouldDirty: true });
  }, [base, position, positions, setValue]);

  const conditionError = errors?.condition?.message;
  const conditionId = `${base}.condition`;
  return (
    <li className="rounded-[16px] p-4 shadow-[inset_0_0_0_1px_var(--edge)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold wrap-anywhere text-ink">{unit.deviceName}</p>
          <p className="font-mono text-xs text-ink-3">SN {unit.serialNo}</p>
        </div>
        <p className="inline-flex items-center gap-1 text-xs text-ink-2">
          <MapPin className="size-3.5" aria-hidden /> Posisi semula: {unit.originalLocation ?? "tidak di rak"}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name={`${base}.condition`}
          render={({ field }) => (
            <fieldset className="sm:col-span-2" aria-describedby={conditionError ? fieldDescriptionId(conditionId) : undefined}>
              <legend className="mb-2 text-[13px] font-bold text-ink-2">
                Kondisi{" "}
                <span className="text-red-ink" aria-hidden>
                  *
                </span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {CONDITIONS.map((value, optionIndex) => {
                  const checked = field.value === value;
                  return (
                    <label
                      key={value}
                      className={cn(
                        "inline-flex min-h-11 cursor-pointer items-center rounded-full bg-white px-4 text-sm font-bold text-ink-2 shadow-[inset_0_0_0_1px_var(--edge)] transition-[box-shadow,background-color,color] duration-200 hover:shadow-[inset_0_0_0_1px_var(--ink)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                        checked && CONDITION_STYLE[value],
                        conditionError && !checked && "shadow-[inset_0_0_0_1px_var(--red)]",
                      )}
                    >
                      <input
                        type="radio"
                        name={field.name}
                        value={value}
                        checked={checked}
                        onChange={() => field.onChange(value)}
                        onBlur={field.onBlur}
                        ref={optionIndex === 0 ? field.ref : undefined}
                        className="sr-only"
                      />
                      {RETURN_CONDITION_LABEL[value]}
                    </label>
                  );
                })}
              </div>
              {conditionError && (
                <p id={fieldDescriptionId(conditionId)} className="mt-2 text-[12.5px] font-semibold text-red-ink">
                  {conditionError}
                </p>
              )}
            </fieldset>
          )}
        />
        <TextInputField
          name={`${base}.note`}
          label={condition && condition !== "GOOD" ? "Catatan kerusakan / kekurangan" : "Catatan unit"}
          required={Boolean(condition && condition !== "GOOD")}
          className="sm:col-span-2"
          placeholder={condition === "DAMAGED" ? "mis. port 2 tidak menyala" : condition === "INCOMPLETE" ? "mis. kabel power tidak ada" : "Opsional"}
          autoComplete="off"
        />
        <FormField label="Taruh di rak" htmlFor={`${base}.rackId`} error={errors?.rackId?.message}>
          <Controller
            control={control}
            name={`${base}.rackId`}
            render={({ field }) => (
              <SelectField
                id={`${base}.rackId`}
                options={[{ value: NO_RACK, label: "Tidak disimpan di rak" }, ...racks.map((r) => ({ value: r.id, label: `${r.name} (${rackRangeLabel(r)})` }))]}
                value={(field.value as string | null | undefined) || NO_RACK}
                onChange={(value) => field.onChange(value && value !== NO_RACK ? value : "")}
                aria-invalid={errors?.rackId ? true : undefined}
                aria-describedby={fieldDescriptionId(`${base}.rackId`)}
              />
            )}
          />
        </FormField>
        <FormField label="Posisi" htmlFor={`${base}.rackPosition`} required={Boolean(rack)} error={errors?.rackPosition?.message} hint={rack ? undefined : "Pilih rak dulu"}>
          <Controller
            control={control}
            name={`${base}.rackPosition`}
            render={({ field }) => (
              <SelectField
                id={`${base}.rackPosition`}
                options={positions.map((p) => ({ value: p, label: p }))}
                value={(field.value as string | null | undefined) || null}
                onChange={(value) => field.onChange(value ?? "")}
                placeholder={rack ? "Pilih posisi…" : "—"}
                disabled={!rack}
                aria-invalid={errors?.rackPosition ? true : undefined}
                aria-describedby={fieldDescriptionId(`${base}.rackPosition`)}
              />
            )}
          />
        </FormField>
      </div>
    </li>
  );
}
