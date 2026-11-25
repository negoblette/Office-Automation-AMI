"use client";

import { CopyPlus, MapPin, Trash2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { fieldDescriptionId, FormField } from "@/components/form/form-field";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import type { AssetCategory } from "@/generated/prisma/enums";
import { rackPositions, rackRangeLabel } from "@/lib/inventory";
import { ASSET_CATEGORY_LABEL, toOptions } from "@/lib/labels";
import { MAX_UNITS_PER_FORM, splitSerials } from "@/lib/validators/asset";
import { type RackOption, SERIAL_HINT } from "./asset-dialogs";

/** Isian satu baris di form berbaris (Daftarkan Unit & Terima Barang) — `unitRowSchema`. */
export type UnitRowValues = {
  deviceName: string;
  quantity: number | string;
  /** Teks isian: satu serial number per baris. */
  serials: string;
  category: AssetCategory;
  rackId: string | null;
  rackPosition: string | null;
  notes: string | null;
};

export const EMPTY_UNIT: UnitRowValues = { deviceName: "", quantity: 1, serials: "", category: "DEMO_UNIT", rackId: "", rackPosition: "", notes: "" };

const NO_RACK = "__none__";

/** Jumlah unit dari isian jumlah (kosong / tidak valid dihitung 0, dibatasi saat validasi). */
export function rowQuantity(value: unknown): number {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
}

/** Total unit semua baris form (hasil `useWatch` "units") — untuk judul bagian & tombol simpan. */
export function unitTotal(units: { quantity?: unknown }[] | undefined): number {
  return (units ?? []).reduce((sum, unit) => sum + rowQuantity(unit?.quantity), 0);
}

/**
 * Satu baris (form `{ units: [...] }`): part number, jumlah, S/N (opsional sejak 2026-11-25), kategori, catatan, rak &
 * posisi (berpasangan). Jumlah > 1 (2026-11-25) → `quantity` unit sejenis, isian S/N jadi daftar (satu per baris, boleh
 * lebih sedikit dari jumlah — sisanya tanpa S/N). `onCopy` = "Salin": baris baru dengan isian yang sama kecuali S/N.
 */
export function UnitRow({ index, racks, onRemove, onCopy }: { index: number; racks: RackOption[]; onRemove?: () => void; onCopy?: () => void }) {
  const { control, formState, setValue } = useFormContext<{ units: UnitRowValues[] }>();
  const base = `units.${index}` as const;
  const errors = formState.errors.units?.[index];
  const rackId = useWatch({ control, name: `${base}.rackId` });
  const position = useWatch({ control, name: `${base}.rackPosition` });
  const deviceName = useWatch({ control, name: `${base}.deviceName` });
  const quantity = rowQuantity(useWatch({ control, name: `${base}.quantity` }));
  const serialCount = splitSerials(useWatch({ control, name: `${base}.serials` }) ?? "").length;
  const rack = racks.find((r) => r.id === rackId);
  const positions = useMemo(() => (rack ? rackPositions(rack.columns, rack.rows) : []), [rack]);
  const rowLabel = `baris ${index + 1}${deviceName ? ` (${deviceName})` : ""}`;
  const many = quantity > 1;

  // Ganti rak → posisi lama dikosongkan bila tidak ada di rak baru.
  useEffect(() => {
    if (position && !positions.includes(position)) setValue(`${base}.rackPosition`, "", { shouldDirty: true });
  }, [base, position, positions, setValue]);

  return (
    <li className="rounded-[16px] p-4 shadow-[inset_0_0_0_1px_var(--edge)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-semibold text-ink">
          Baris {index + 1}
          {many && <span className="ml-2 text-sm font-medium text-muted-foreground">· {quantity} unit</span>}
        </p>
        <div className="flex gap-1">
          {onCopy && (
            <Button type="button" variant="ghost" size="sm" onClick={onCopy} aria-label={`Salin ${rowLabel} tanpa serial number`}>
              <CopyPlus aria-hidden /> Salin
            </Button>
          )}
          {onRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={`Hapus ${rowLabel}`}>
              <Trash2 aria-hidden /> Hapus
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInputField name={`${base}.deviceName`} label="Part number / deskripsi" required placeholder="mis. Switch 24 port" autoComplete="off" />
        <TextInputField
          name={`${base}.quantity`}
          label="Jumlah"
          required
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_UNITS_PER_FORM}
          step={1}
          hint="Unit sejenis di baris ini. Tiap unit tercatat sendiri di Daftar Unit."
        />
        {many ? (
          <TextareaField
            name={`${base}.serials`}
            label="Serial number"
            className="sm:col-span-2"
            rows={Math.min(Math.max(quantity, 3), 8)}
            placeholder={"Satu serial number per baris\nmis.\nSN0001\nSN0002"}
            hint={`Opsional, satu per baris (bisa ditempel dari Excel). ${serialCount} dari ${quantity} unit ber-S/N${
              serialCount < quantity ? ` — ${quantity - serialCount} unit tanpa S/N` : ""
            }.`}
          />
        ) : (
          <TextInputField name={`${base}.serials`} label="Serial number" hint={SERIAL_HINT} autoComplete="off" />
        )}
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
                value={field.value || NO_RACK}
                onChange={(value) => field.onChange(value && value !== NO_RACK ? value : "")}
                aria-invalid={errors?.rackId ? true : undefined}
                aria-describedby={fieldDescriptionId(`${base}.rackId`)}
              />
            )}
          />
        </FormField>
        <FormField
          label="Posisi"
          htmlFor={`${base}.rackPosition`}
          required={Boolean(rack)}
          error={errors?.rackPosition?.message}
          hint={rack ? (many ? "Semua unit di baris ini disimpan di posisi yang sama." : undefined) : "Pilih rak dulu"}
        >
          <Controller
            control={control}
            name={`${base}.rackPosition`}
            render={({ field }) => (
              <SelectField
                id={`${base}.rackPosition`}
                options={positions.map((p) => ({ value: p, label: p }))}
                value={field.value || null}
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
