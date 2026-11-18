"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, CalendarClock, CircleCheck, FlaskConical, LifeBuoy, Link2, Loader2, MapPin, Search, Send, Shapes, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { type Control, Controller, FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import type { z } from "zod";
import { AutocompleteInput } from "@/components/form/autocomplete-input";
import { DateInputField, FormSection, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { fieldDescriptionId, FormField } from "@/components/form/form-field";
import { DraftNotice, useFormDraft, useUnsavedChangesGuard } from "@/components/form/unsaved-changes";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { useFeedback } from "@/components/shared/feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LoanPurpose } from "@/generated/prisma/enums";
import { formatLoanDuration, LOAN_PURPOSE_HINT, LOAN_PURPOSE_LABEL, MAX_LOAN_ITEMS, maxLoanEnd, RETURN_CONDITION_LABEL } from "@/lib/demo-loan";
import { formatDate, toJakartaIsoDate } from "@/lib/format";
import { ASSET_CATEGORY_LABEL } from "@/lib/labels";
import type { LoanFormOptions, LoanUnitOption } from "@/lib/services/demo-loan-queries";
import { cn } from "@/lib/utils";
import { demoLoanSchema } from "@/lib/validators/demo-loan";
import { reviseDemoLoanAction, submitDemoLoanAction } from "./actions";

type FormInput = z.input<typeof demoLoanSchema>;
type FormOutput = z.output<typeof demoLoanSchema>;

export type LoanFormValues = {
  /** Kosong = belum dipilih (wajib). */
  purpose: LoanPurpose | "";
  /** Detail kegunaan "Lainnya". */
  purposeDetail: string;
  assetIds: string[];
  borrowerName: string;
  picName: string;
  picEmail: string;
  salesPersonId: string;
  startDate: string;
  /** Tanggal selesai (hari terakhir pinjam). */
  dueDate: string;
  remarks: string;
};

const isoLabel = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

const LOAN_PURPOSES: LoanPurpose[] = ["BACKUP_UNIT", "POC", "OTHER"];
const PURPOSE_ICON = { BACKUP_UNIT: LifeBuoy, POC: FlaskConical, OTHER: Shapes } as const;

/**
 * Form pengajuan peminjaman unit (Product Trial Form, Fase 16.2). Dipakai untuk pengajuan baru (`loanId` null) dan
 * mengubah / mengajukan ulang pengajuan yang belum disetujui. Ketersediaan unit & hak akses dicek ulang di server.
 */
export function LoanForm({
  loanId,
  resubmit,
  defaultValues,
  options,
  draftKey,
}: {
  loanId: string | null;
  /** Pengajuan yang ditolak: tombol jadi "Ajukan Ulang". */
  resubmit?: boolean;
  defaultValues: LoanFormValues;
  options: LoanFormOptions;
  draftKey: string;
}) {
  const router = useRouter();
  const { notify } = useFeedback();
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(demoLoanSchema), defaultValues: defaultValues as FormInput });
  const { serverError, pending, submit } = useActionSubmit(form);
  useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form, draftKey);
  const [incomplete, setIncomplete] = useState(false);
  const today = toJakartaIsoDate();

  const onSubmit = form.handleSubmit(
    (values) => {
      setIncomplete(false);
      submit(
        () => (loanId ? reviseDemoLoanAction(loanId, values) : submitDemoLoanAction(values)),
        (data) => {
          draft.clear();
          notify(!loanId ? "Pengajuan peminjaman terkirim untuk approval" : resubmit ? "Pengajuan diajukan ulang untuk approval" : "Perubahan pengajuan tersimpan");
          router.push(`/inventory/peminjaman/${data.loanId}`);
        },
      );
    },
    () => setIncomplete(true),
  );

  const submitLabel = !loanId ? "Ajukan Peminjaman" : resubmit ? "Ajukan Ulang" : "Simpan Perubahan";

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        {draft.pendingDraft && <DraftNotice savedAt={draft.pendingDraft.savedAt} onRestore={draft.restore} onDiscard={draft.discard} />}
        <FormAlert message={serverError} />

        <div className="flex flex-col gap-[26px] rounded-2xl bg-card p-5 shadow-card sm:p-6">
          <FormSection title="Jenis pengajuan" description="Untuk apa unit ini dipinjamkan ke customer.">
            <PurposeField />
          </FormSection>

          <FormSection title="Unit yang dipinjam" description="Pilih unit dari gudang. Serial number dan posisi rak terisi otomatis dari data unit.">
            <UnitPicker units={options.units} />
          </FormSection>

          <FormSection title="Peminjam" description="Perusahaan tujuan dan PIC-nya (tertulis di form sebagai “Lend To … up: …”).">
            <BorrowerField customers={options.customers} />
            <TextInputField name="picName" label="Nama PIC (up:)" required placeholder="mis. Bapak Surahman" autoComplete="off" />
            <TextInputField
              name="picEmail"
              label="Email PIC"
              type="email"
              inputMode="email"
              autoComplete="off"
              required
              hint="Kontak PIC untuk Operational (sistem tidak mengirim email ke peminjam)."
            />
          </FormSection>

          <FormSection title="Periode & penanggung jawab" description="Pilih tanggal mulai dan tanggal selesai; lama pinjam dihitung otomatis.">
            <SelectInputField
              name="salesPersonId"
              label="Sales Person"
              required
              options={options.salesPeople}
              placeholder={options.salesPeople.length ? "Pilih Sales Person…" : "Belum ada karyawan Sales aktif"}
              disabled={options.salesPeople.length === 0}
            />
            <PeriodFields today={today} />

            <TextareaField
              name="remarks"
              label="Keperluan (Remarks)"
              className="sm:col-span-2"
              placeholder="mis. Trial perangkat untuk proses relokasi BSD ke DMG"
              hint="Opsional. Tercetak di form."
            />
          </FormSection>
        </div>

        {incomplete && <FormAlert message="Masih ada isian yang belum lengkap. Periksa kolom yang ditandai." />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href={loanId ? `/inventory/peminjaman/${loanId}` : "/inventory/peminjaman"} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Batal
          </Link>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            {submitLabel}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Jangka pinjam (2026-11-17): tanggal mulai & tanggal selesai (hari terakhir = jatuh tempo), lalu lamanya dihitung
 * otomatis dalam tahun / bulan / hari. Batas tanggal selesai mengikuti tanggal mulai (tidak sebelum, maks. 2 tahun).
 */
function PeriodFields({ today }: { today: string }) {
  const { control } = useFormContext<FormInput, unknown, FormOutput>();
  const [startDate, dueDate] = useWatch({ control, name: ["startDate", "dueDate"] }) as [string | undefined, string | undefined];
  const start = startDate && ISO_DATE.test(startDate) ? startDate : null;
  const end = dueDate && ISO_DATE.test(dueDate) ? dueDate : null;
  return (
    <>
      <DateInputField name="startDate" label="Tanggal mulai" required min={today} />
      <DateInputField
        name="dueDate"
        label="Tanggal selesai (jatuh tempo)"
        required
        min={start ?? today}
        max={start ? maxLoanEnd(start) : undefined}
        hint="Hari terakhir unit dipinjam. Maksimal 2 tahun."
      />
      <div role="status" className="flex items-start gap-3 rounded-[14px] bg-info-soft px-4 py-3 sm:col-span-2">
        <CalendarClock className="mt-0.5 size-5 shrink-0 text-brand-deep" aria-hidden />
        {start && end && end >= start ? (
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold text-ink-3">Lama pinjam</p>
            <p className="text-[17px] leading-snug font-bold text-ink">{formatLoanDuration(start, end)}</p>
            <p className="text-sm text-ink-2">
              {isoLabel(start)} – {isoLabel(end)} · jatuh tempo {isoLabel(end)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink">
            {start && end ? "Tanggal selesai sebelum tanggal mulai." : "Isi tanggal mulai dan tanggal selesai untuk menghitung lama pinjam."}
          </p>
        )}
      </div>
    </>
  );
}
/**
 * Kegunaan peminjaman: kartu pilihan Backup Unit / POC / Lainnya (radio asli, jadi bisa dipilih dengan panah keyboard).
 * "Lainnya" memunculkan kolom detail yang wajib diisi.
 */
function PurposeField() {
  const { control, formState } = useFormContext<FormInput, unknown, FormOutput>();
  const error = formState.errors.purpose?.message;
  const purpose = useWatch({ control, name: "purpose" });
  return (
    <>
      <PurposeCards control={control} error={error} />
      {purpose === "OTHER" && (
        <TextInputField
          name="purposeDetail"
          label="Detail kegunaan"
          required
          className="sm:col-span-2"
          placeholder="mis. Unit pameran di event customer, uji kompatibilitas sebelum tender"
          hint="Tercetak di kolom Remarks form."
          autoComplete="off"
        />
      )}
    </>
  );
}

function PurposeCards({ control, error }: { control: Control<FormInput, unknown, FormOutput>; error?: string }) {
  return (
    <Controller
      control={control}
      name="purpose"
      render={({ field }) => (
        <fieldset className="sm:col-span-2" aria-describedby={error ? fieldDescriptionId("purpose") : undefined}>
          <legend className="mb-2 text-[13px] font-bold text-ink-2">
            Kegunaan{" "}
            <span className="text-red-ink" aria-hidden>
              *
            </span>
          </legend>
          <div className="grid gap-3 md:grid-cols-3">
            {LOAN_PURPOSES.map((value, index) => {
              const Icon = PURPOSE_ICON[value];
              const checked = field.value === value;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-[76px] cursor-pointer items-start gap-3 rounded-[16px] bg-white p-4 shadow-[inset_0_0_0_1px_var(--edge)] transition-[box-shadow,background-color] duration-200 hover:shadow-[inset_0_0_0_1px_var(--ink)] has-[:focus-visible]:shadow-[inset_0_0_0_2px_var(--brand),0_0_0_4px_var(--brand-ring)]",
                    checked && "bg-brand-soft/50 shadow-[inset_0_0_0_2px_var(--brand)] hover:shadow-[inset_0_0_0_2px_var(--brand)]",
                    error && "shadow-[inset_0_0_0_2px_var(--red)]",
                  )}
                >
                  <input
                    type="radio"
                    name={field.name}
                    value={value}
                    checked={checked}
                    onChange={() => field.onChange(value)}
                    onBlur={field.onBlur}
                    ref={index === 0 ? field.ref : undefined}
                    className="sr-only"
                  />
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", checked ? "bg-brand text-white" : "bg-panel text-ink-2")} aria-hidden>
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold text-ink">{LOAN_PURPOSE_LABEL[value]}</span>
                    <span className="block text-[13px] text-ink-3">{LOAN_PURPOSE_HINT[value]}</span>
                  </span>
                  <CircleCheck className={cn("size-5 shrink-0 text-brand transition-opacity duration-200", checked ? "opacity-100" : "opacity-0")} aria-hidden />
                </label>
              );
            })}
          </div>
          {error && (
            <p id={fieldDescriptionId("purpose")} className="mt-2 text-[12.5px] font-semibold text-red-ink">
              {error}
            </p>
          )}
        </fieldset>
      )}
    />
  );
}

/**
 * Peminjam hybrid: ketik nama perusahaan; data Customer muncul sebagai saran (dropdown sistem). Nama yang sama dengan
 * Customer (tanpa beda huruf besar/kecil) otomatis ditautkan; nama lain hanya tersimpan di peminjaman ini.
 */
function BorrowerField({ customers }: { customers: string[] }) {
  const { control, formState } = useFormContext<FormInput, unknown, FormOutput>();
  const name = (useWatch({ control, name: "borrowerName" }) ?? "") as string;
  const match = useMemo(() => {
    const key = name.trim().toLowerCase();
    return key ? customers.find((customer) => customer.toLowerCase() === key) : undefined;
  }, [customers, name]);
  const error = formState.errors.borrowerName?.message;
  const hint = !name.trim() ? (
    "Pilih dari daftar Customer, atau ketik nama perusahaan baru."
  ) : match ? (
    <span className="inline-flex items-center gap-1.5 font-semibold text-green-deep">
      <Link2 className="size-3.5" aria-hidden /> Terhubung ke data Customer “{match}”
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5">
      <Building2 className="size-3.5" aria-hidden /> Perusahaan baru — tersimpan di peminjaman ini saja.
    </span>
  );
  return (
    <FormField label="Perusahaan peminjam (Lend To)" htmlFor="borrowerName" required error={error} hint={hint} className="sm:col-span-2">
      <Controller
        control={control}
        name="borrowerName"
        render={({ field }) => (
          <AutocompleteInput
            id="borrowerName"
            value={(field.value as string) ?? ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            inputRef={field.ref}
            suggestions={customers}
            icon={Building2}
            placeholder="mis. PT Bank Danamon Indonesia"
            emptyText="Belum ada di data Customer — nama ini disimpan sebagai perusahaan baru."
            aria-required
            aria-invalid={error ? true : undefined}
            aria-describedby={fieldDescriptionId("borrowerName")}
          />
        )}
      />
    </FormField>
  );
}
/** Pemilih unit: cari nama / SN / rak, centang beberapa unit. Unit yang sedang diajukan / dipinjam tampil nonaktif. */
function UnitPicker({ units }: { units: LoanUnitOption[] }) {
  const { control, formState } = useFormContext<FormInput, unknown, FormOutput>();
  const [query, setQuery] = useState("");
  const searchId = useId();
  const error = formState.errors.assetIds?.message ?? formState.errors.assetIds?.root?.message;
  const byId = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const available = units.filter((unit) => !unit.unavailable).length;

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = words.length
      ? units.filter((unit) => {
          const text = `${unit.deviceName} ${unit.serialNo} ${unit.location ?? "tidak di rak"} ${ASSET_CATEGORY_LABEL[unit.category]} ${unit.ownerLabel}`.toLowerCase();
          return words.every((word) => text.includes(word));
        })
      : units;
    // Yang tersedia di atas; urutan nama tetap.
    return [...list].sort((a, b) => Number(Boolean(a.unavailable)) - Number(Boolean(b.unavailable)));
  }, [units, query]);

  return (
    <Controller
      control={control}
      name="assetIds"
      render={({ field }) => {
        const selected: string[] = Array.isArray(field.value) ? field.value : [];
        const toggle = (id: string, checked: boolean) =>
          field.onChange(checked ? [...selected, id] : selected.filter((value) => value !== id));
        const full = selected.length >= MAX_LOAN_ITEMS;
        return (
          <div className="flex flex-col gap-4 sm:col-span-2">
            {selected.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-bold text-ink-2">
                  Dipilih: {selected.length} unit
                </p>
                <ul className="flex flex-wrap gap-2" aria-label="Unit yang dipilih">
                  {selected.map((id) => {
                    const unit = byId.get(id);
                    return (
                      <li key={id} className="flex items-center gap-1 rounded-full bg-panel py-1 pr-1 pl-3 text-[13px] font-semibold text-ink">
                        <span className="max-w-[16rem] truncate" title={unit ? `${unit.deviceName} · SN ${unit.serialNo}` : id}>
                          {unit ? `${unit.deviceName} · ${unit.serialNo}` : "Unit tidak ditemukan"}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-ink-3 hover:text-ink"
                          aria-label={`Batalkan pilihan ${unit ? `${unit.deviceName} SN ${unit.serialNo}` : "unit"}`}
                          onClick={() => toggle(id, false)}
                        >
                          <X aria-hidden />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-[7px]">
              <label htmlFor={searchId} className="text-[13px] font-bold text-ink-2">
                Cari unit
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
                <Input
                  id={searchId}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Part number, serial number, atau rak…"
                  className="pl-10"
                  autoComplete="off"
                />
              </div>
            </div>

            <fieldset
              className="flex flex-col"
              aria-describedby={fieldDescriptionId("assetIds")}
              aria-invalid={error ? true : undefined}
            >
              <legend className="mb-2 text-[13px] font-bold text-ink-2">
                Daftar unit <span className="font-semibold text-ink-3">· {available} tersedia dari {units.length}</span>
                <span className="text-red-ink" aria-hidden>
                  {" "}
                  *
                </span>
              </legend>
              {units.length === 0 ? (
                <p className="rounded-[14px] bg-panel px-4 py-6 text-center text-sm text-ink-3">
                  Belum ada unit terdaftar. Operational / Admin mendaftarkannya di Inventaris → Daftar Unit.
                </p>
              ) : filtered.length === 0 ? (
                <p className="rounded-[14px] bg-panel px-4 py-6 text-center text-sm text-ink-3">Tidak ada unit yang cocok dengan “{query}”.</p>
              ) : (
                <ul
                  className={cn(
                    "max-h-[22rem] divide-y divide-line overflow-y-auto overscroll-contain rounded-[14px] shadow-[inset_0_0_0_1px_var(--edge)]",
                    error && "shadow-[inset_0_0_0_2px_var(--red)]",
                  )}
                >
                  {filtered.map((unit) => {
                    const checked = selected.includes(unit.id);
                    const disabled = Boolean(unit.unavailable) || (full && !checked);
                    return (
                      <li key={unit.id}>
                        <label
                          className={cn(
                            "flex min-h-14 items-start gap-3 px-3.5 py-2.5 transition-colors duration-200",
                            disabled ? "cursor-not-allowed bg-panel/60" : "cursor-pointer hover:bg-panel",
                            checked && "bg-brand-soft/60 hover:bg-brand-soft",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
                            checked={checked}
                            disabled={disabled}
                            onChange={(event) => toggle(unit.id, event.target.checked)}
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                            <span className="min-w-0">
                              <span className={cn("block text-sm font-semibold wrap-anywhere", disabled ? "text-ink-3" : "text-ink")}>{unit.deviceName}</span>
                              <span className="block font-mono text-xs text-ink-3">SN {unit.serialNo}</span>
                              {unit.ownership !== "AMI" && <span className="mt-0.5 block text-xs font-semibold text-amber-deep">{unit.ownerLabel}</span>}
                            </span>
                            <span className="flex shrink-0 flex-col gap-0.5 text-xs sm:items-end">
                              <span className={cn("inline-flex items-center gap-1", unit.location ? "text-ink-2" : "text-ink-3")}>
                                <MapPin className="size-3.5" aria-hidden />
                                {unit.location ?? "Tidak di rak"}
                              </span>
                              {unit.unavailable && <span className="font-semibold text-amber-deep">{unit.unavailable}</span>}
                              {/* Terakhir kembali rusak / tidak lengkap (Tahap 16.5): tetap boleh dipilih, tapi pemohon diberi tahu. */}
                              {!unit.unavailable && unit.lastReturn && unit.lastReturn.condition !== "GOOD" && (
                                <span className="font-semibold wrap-anywhere text-red-ink">
                                  Terakhir kembali {RETURN_CONDITION_LABEL[unit.lastReturn.condition].toLowerCase()}
                                  {unit.lastReturn.note && `: ${unit.lastReturn.note}`}
                                </span>
                              )}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {error ? (
                <p id={fieldDescriptionId("assetIds")} className="mt-2 text-[12.5px] font-semibold text-red-ink">
                  {error}
                </p>
              ) : (
                <p id={fieldDescriptionId("assetIds")} className="mt-2 text-[12.5px] text-ink-3">
                  {full ? `Batas ${MAX_LOAN_ITEMS} unit per form tercapai.` : "Unit yang sedang diajukan atau dipinjam tidak bisa dipilih."}
                </p>
              )}
            </fieldset>
          </div>
        );
      }}
    />
  );
}
