"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, FileCheckCorner, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form";
import type { z } from "zod";
import { AutocompleteInput } from "@/components/form/autocomplete-input";
import { DateInputField, FormSection, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { fieldDescriptionId, FormField } from "@/components/form/form-field";
import { SelectField } from "@/components/form/select-field";
import { DraftNotice, useFormDraft, useUnsavedChangesGuard } from "@/components/form/unsaved-changes";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { useFeedback } from "@/components/shared/feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { MAX_LOAN_ITEMS } from "@/lib/demo-loan";
import { rackPositions, rackRangeLabel } from "@/lib/inventory";
import { ASSET_CATEGORY_LABEL, toOptions } from "@/lib/labels";
import type { GoodsReceiptFormOptions } from "@/lib/services/goods-receipt-queries";
import { cn } from "@/lib/utils";
import { goodsReceiptSchema } from "@/lib/validators/goods-receipt";
import type { RackOption } from "../asset-dialogs";
import { receiveGoodsAction } from "./actions";

type FormInput = z.input<typeof goodsReceiptSchema>;
type FormOutput = z.output<typeof goodsReceiptSchema>;

const NO_RACK = "__none__";
const OWNERSHIPS = [
  { value: "PRINCIPAL", label: "Principal", placeholder: "mis. Cisco, Fortinet" },
  { value: "DISTRIBUTOR", label: "Distributor", placeholder: "mis. PT Datascrip" },
] as const;

const emptyReceiptUnit = { deviceName: "", serialNo: "", category: "DEMO_UNIT" as const, rackId: "", rackPosition: "", notes: "" };

/**
 * Terima Barang (2026-11-20, Operational): satu kedatangan dari principal / distributor = satu Hardware Admission Form,
 * boleh banyak unit. Simpan → unit terdaftar di Daftar Unit dengan kepemilikan itu & HAF terbit (lalu dicetak). Dicek
 * ulang di server (hak akses, PIC, serial number, rak).
 */
export function ReceiptForm({ defaultValues, options, racks, today, draftKey }: {
  defaultValues: FormInput;
  options: GoodsReceiptFormOptions;
  racks: RackOption[];
  today: string;
  draftKey: string;
}) {
  const router = useRouter();
  const { notify } = useFeedback();
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(goodsReceiptSchema), defaultValues });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "units" });
  const { serverError, pending, submit } = useActionSubmit(form);
  useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form, draftKey);
  const [incomplete, setIncomplete] = useState(false);
  const unitsError = form.formState.errors.units?.message ?? form.formState.errors.units?.root?.message;

  const onSubmit = form.handleSubmit(
    (values) => {
      setIncomplete(false);
      submit(
        () => receiveGoodsAction(values),
        (data) => {
          draft.clear();
          notify(`Penerimaan tercatat — HAF ${data.hafNumber} siap dicetak`);
          router.push(`/inventory/penerimaan/${data.receiptId}`);
        },
      );
    },
    () => setIncomplete(true),
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        {draft.pendingDraft && <DraftNotice savedAt={draft.pendingDraft.savedAt} onRestore={draft.restore} onDiscard={draft.discard} />}
        <FormAlert message={serverError} />

        <div className="flex flex-col gap-[26px] rounded-2xl bg-card p-5 shadow-card sm:p-6">
          <FormSection title="Asal barang" description="Principal / distributor pengirim dan kontaknya (tertulis di HAF sebagai “From … up: …”).">
            <OwnerFields owners={options.owners} />
            <TextInputField name="contactName" label="Kontak (up:)" required placeholder="mis. Bapak Budi" autoComplete="off" />
            <TextInputField name="senderName" label="Pengirim (Returned By)" placeholder="mis. kurir Cisco" autoComplete="off" hint="Opsional. Yang menyerahkan barang." />
          </FormSection>

          <FormSection title="Penerimaan" description="Kapan barang diterima, siapa PIC & penerimanya di AMI.">
            <DateInputField name="receivedDate" label="Tanggal terima" required max={today} />
            <SelectInputField
              name="picId"
              label="PIC"
              required
              options={options.pics}
              placeholder={options.pics.length ? "Pilih PIC…" : "Belum ada karyawan Engineer / Sales aktif"}
              hint="Penanggung jawab dari AMI (Engineer / Sales)."
            />
            <SelectInputField name="receiverId" label="Diterima oleh (Received By)" required options={options.employees} placeholder="Pilih karyawan…" />
            <TextareaField name="purpose" label="Keperluan / catatan" className="sm:col-span-2" placeholder="mis. Unit demo untuk POC Bank X" hint="Opsional. Tercetak di Remarks HAF." />
          </FormSection>

          <FormSection title={`Unit yang diterima (${fields.length})`} description="Satu baris per unit. Support / warranty bisa dilengkapi nanti lewat Ubah Unit.">
            <ol className="flex flex-col gap-4 sm:col-span-2" aria-label="Unit yang diterima">
              {fields.map((field, index) => (
                <UnitRow key={field.id} index={index} racks={racks} onRemove={fields.length > 1 ? () => remove(index) : undefined} />
              ))}
            </ol>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Button type="button" variant="outline" className="self-start" disabled={fields.length >= MAX_LOAN_ITEMS} onClick={() => append({ ...emptyReceiptUnit })}>
                <Plus aria-hidden /> Tambah unit
              </Button>
              {unitsError && <p className="text-[12.5px] font-semibold text-red-ink">{unitsError}</p>}
            </div>
          </FormSection>
        </div>

        {incomplete && <FormAlert message="Masih ada isian yang belum lengkap. Periksa kolom yang ditandai." />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href="/inventory/penerimaan" className={buttonVariants({ variant: "outline", size: "lg" })}>
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

/** Principal / Distributor (radio asli) + nama (saran dari nama yang pernah dipakai supaya ejaannya seragam). */
function OwnerFields({ owners }: { owners: string[] }) {
  const { control, formState } = useFormContext<FormInput, unknown, FormOutput>();
  const ownership = useWatch({ control, name: "ownership" });
  const ownershipError = formState.errors.ownership?.message;
  const nameError = formState.errors.ownerName?.message;
  const placeholder = OWNERSHIPS.find((option) => option.value === ownership)?.placeholder ?? "Nama principal / distributor";
  return (
    <>
      <Controller
        control={control}
        name="ownership"
        render={({ field }) => (
          <fieldset aria-describedby={ownershipError ? fieldDescriptionId("ownership") : undefined}>
            <legend className="mb-2 text-[13px] font-bold text-ink-2">
              Dari{" "}
              <span className="text-red-ink" aria-hidden>
                *
              </span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {OWNERSHIPS.map((option, index) => {
                const checked = field.value === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "inline-flex min-h-11 cursor-pointer items-center rounded-full bg-white px-4 text-sm font-bold text-ink-2 shadow-[inset_0_0_0_1px_var(--edge)] transition-[box-shadow,background-color,color] duration-200 hover:shadow-[inset_0_0_0_1px_var(--ink)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                      checked && "bg-brand-soft/60 text-ink shadow-[inset_0_0_0_2px_var(--brand)]",
                      ownershipError && !checked && "shadow-[inset_0_0_0_1px_var(--red)]",
                    )}
                  >
                    <input
                      type="radio"
                      name={field.name}
                      value={option.value}
                      checked={checked}
                      onChange={() => field.onChange(option.value)}
                      onBlur={field.onBlur}
                      ref={index === 0 ? field.ref : undefined}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
            {ownershipError && (
              <p id={fieldDescriptionId("ownership")} className="mt-2 text-[12.5px] font-semibold text-red-ink">
                {ownershipError}
              </p>
            )}
          </fieldset>
        )}
      />
      <FormField
        label={ownership === "DISTRIBUTOR" ? "Nama distributor" : "Nama principal"}
        htmlFor="ownerName"
        required
        error={nameError}
        hint="Tertulis di nomor HAF (…/AMI-HAF/<nama>/…) dan sebagai pemilik unit."
      >
        <Controller
          control={control}
          name="ownerName"
          render={({ field }) => (
            <AutocompleteInput
              id="ownerName"
              value={(field.value as string) ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              inputRef={field.ref}
              suggestions={owners}
              icon={Building2}
              placeholder={placeholder}
              emptyText="Nama baru — akan dipakai untuk unit-unit ini."
              aria-required
              aria-invalid={nameError ? true : undefined}
              aria-describedby={fieldDescriptionId("ownerName")}
            />
          )}
        />
      </FormField>
    </>
  );
}

/** Satu baris unit: part number, S/N, kategori, rak & posisi (berpasangan), catatan. */
function UnitRow({ index, racks, onRemove }: { index: number; racks: RackOption[]; onRemove?: () => void }) {
  const { control, formState, setValue } = useFormContext<FormInput, unknown, FormOutput>();
  const base = `units.${index}` as const;
  const errors = formState.errors.units?.[index];
  const rackId = useWatch({ control, name: `${base}.rackId` }) as string | null | undefined;
  const position = useWatch({ control, name: `${base}.rackPosition` }) as string | null | undefined;
  const deviceName = useWatch({ control, name: `${base}.deviceName` }) as string | undefined;
  const rack = racks.find((r) => r.id === rackId);
  const positions = useMemo(() => (rack ? rackPositions(rack.columns, rack.rows) : []), [rack]);

  // Ganti rak → posisi lama dikosongkan bila tidak ada di rak baru.
  useEffect(() => {
    if (position && !positions.includes(position)) setValue(`${base}.rackPosition`, "", { shouldDirty: true });
  }, [base, position, positions, setValue]);

  return (
    <li className="rounded-[16px] p-4 shadow-[inset_0_0_0_1px_var(--edge)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-semibold text-ink">Unit {index + 1}</p>
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={`Hapus baris unit ${index + 1}${deviceName ? ` (${deviceName})` : ""}`}>
            <Trash2 aria-hidden /> Hapus
          </Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInputField name={`${base}.deviceName`} label="Part number / deskripsi" required placeholder="mis. Switch 24 port" autoComplete="off" />
        <TextInputField name={`${base}.serialNo`} label="Serial number" required hint="Disimpan dalam huruf besar" autoComplete="off" />
        <SelectInputField name={`${base}.category`} label="Kategori" required options={toOptions(ASSET_CATEGORY_LABEL)} />
        <TextInputField name={`${base}.notes`} label="Catatan" placeholder="Opsional, mis. kelengkapan" autoComplete="off" />
        <FormField label="Rak" htmlFor={`${base}.rackId`} error={errors?.rackId?.message}>
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
      {rack && position && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-2">
          <MapPin className="size-3.5" aria-hidden /> {rack.name} · {position}
        </p>
      )}
    </li>
  );
}
