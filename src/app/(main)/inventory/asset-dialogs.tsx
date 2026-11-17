"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useTransition } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { DateInputField, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { fieldDescriptionId, FormField } from "@/components/form/form-field";
import { SelectField } from "@/components/form/select-field";
import { useFeedback } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import type { AssetOwnership } from "@/generated/prisma/enums";
import { ASSET_OWNERSHIP_LABEL, rackPositions, rackRangeLabel } from "@/lib/inventory";
import { ASSET_CATEGORY_LABEL, toOptions } from "@/lib/labels";
import type { AssetRow } from "@/lib/services/asset-queries";
import { assetSchema } from "@/lib/validators/asset";
import { deleteAssetAction, saveAssetAction } from "./actions";

export type RackOption = { id: string; name: string; columns: number; rows: number };

const NO_RACK = "__none__";

/**
 * Rak + posisi (2026-11-17). Posisi mengikuti ukuran rak yang dipilih (A1…); ganti rak → posisi dikosongkan bila tidak
 * ada di rak baru. "Tidak disimpan di rak" untuk unit yang sedang di luar gudang.
 */
function RackFields({ racks }: { racks: RackOption[] }) {
  const { control, setValue, formState } = useFormContext();
  const rackId = useWatch({ control, name: "rackId" }) as string;
  const position = useWatch({ control, name: "rackPosition" }) as string;
  const rack = racks.find((r) => r.id === rackId);
  const positions = useMemo(() => (rack ? rackPositions(rack.columns, rack.rows) : []), [rack]);

  useEffect(() => {
    if (position && !positions.includes(position)) setValue("rackPosition", "", { shouldDirty: true });
  }, [position, positions, setValue]);

  const rackError = formState.errors.rackId?.message as string | undefined;
  const positionError = formState.errors.rackPosition?.message as string | undefined;
  return (
    <>
      <FormField label="Rak" htmlFor="rackId" error={rackError} hint={racks.length ? undefined : "Belum ada rak. Admin menambahkannya di Setting → Inventaris & Rak."}>
        <Controller
          control={control}
          name="rackId"
          render={({ field }) => (
            <SelectField
              id="rackId"
              options={[{ value: NO_RACK, label: "Tidak disimpan di rak" }, ...racks.map((r) => ({ value: r.id, label: `${r.name} (${rackRangeLabel(r)})` }))]}
              value={field.value || NO_RACK}
              onChange={(value) => field.onChange(value && value !== NO_RACK ? value : "")}
              aria-invalid={rackError ? true : undefined}
              aria-describedby={fieldDescriptionId("rackId")}
            />
          )}
        />
      </FormField>
      <FormField label="Posisi" htmlFor="rackPosition" required={Boolean(rack)} error={positionError} hint={rack ? "Huruf = kolom, angka = baris. Satu posisi boleh berisi beberapa unit." : "Pilih rak dulu"}>
        <Controller
          control={control}
          name="rackPosition"
          render={({ field }) => (
            <SelectField
              id="rackPosition"
              options={positions.map((p) => ({ value: p, label: p }))}
              value={field.value || null}
              onChange={(value) => field.onChange(value ?? "")}
              placeholder={rack ? "Pilih posisi…" : "—"}
              disabled={!rack}
              aria-required={Boolean(rack) || undefined}
              aria-invalid={positionError ? true : undefined}
              aria-describedby={fieldDescriptionId("rackPosition")}
            />
          )}
        />
      </FormField>
    </>
  );
}

/**
 * Kepemilikan (2026-11-17): milik AMI, atau titipan principal / distributor — nama pemiliknya wajib diisi (kolom muncul
 * setelah memilih Principal / Distributor).
 */
function OwnershipFields() {
  const { control } = useFormContext();
  const ownership = (useWatch({ control, name: "ownership" }) ?? "AMI") as AssetOwnership;
  return (
    <>
      <SelectInputField
        name="ownership"
        label="Kepemilikan"
        required
        options={toOptions(ASSET_OWNERSHIP_LABEL)}
        hint={ownership === "AMI" ? "Unit dari principal / distributor dipisahkan dari milik AMI." : undefined}
      />
      {ownership !== "AMI" && (
        <TextInputField
          name="ownerName"
          label={ownership === "PRINCIPAL" ? "Nama principal" : "Nama distributor"}
          required
          placeholder={ownership === "PRINCIPAL" ? "mis. Cisco, Fortinet" : "mis. PT Datascrip"}
          className="sm:col-span-2"
        />
      )}
    </>
  );
}

/**
 * Daftarkan unit baru / ubah data unit (INV-01). Setiap simpan tercatat di Riwayat Unit (siapa, kapan, apa yang berubah).
 * `trigger` = tombol pengganti (mis. "Ubah Unit" di halaman detail).
 */
export function AssetFormDialog({ asset, racks, trigger }: { asset?: AssetRow; racks: RackOption[]; trigger?: React.ReactElement }) {
  return (
    <FormDialog
      wide
      trigger={
        trigger ?? (asset ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${asset.deviceName}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="lg">
            <Plus aria-hidden /> Daftarkan Unit
          </Button>
        ))
      }
      title={asset ? `Ubah ${asset.deviceName}` : "Daftarkan Unit"}
      description={asset ? "Perubahan tercatat di Riwayat Unit beserta nama Anda." : undefined}
      schema={assetSchema}
      defaults={{
        deviceName: asset?.deviceName ?? "",
        serialNo: asset?.serialNo ?? "",
        category: asset?.category ?? "DEMO_UNIT",
        supportStart: asset?.supportStart ?? "",
        supportEnd: asset?.supportEnd ?? "",
        warrantyStart: asset?.warrantyStart ?? "",
        warrantyEnd: asset?.warrantyEnd ?? "",
        warrantyNote: asset?.warrantyNote ?? "",
        notes: asset?.notes ?? "",
        ownership: asset?.ownership ?? "AMI",
        ownerName: asset?.ownerName ?? "",
        rackId: asset?.rackId ?? "",
        rackPosition: asset?.rackPosition ?? "",
      }}
      submitLabel="Simpan"
      action={(values) => saveAssetAction(asset?.id ?? null, values)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInputField name="deviceName" label="Part number / deskripsi" required placeholder="mis. SFP+ (10G)" />
        <TextInputField name="serialNo" label="Serial number" required hint="Disimpan dalam huruf besar" />
        <SelectInputField name="category" label="Kategori" required options={toOptions(ASSET_CATEGORY_LABEL)} />
        <OwnershipFields />
        <RackFields racks={racks} />
        <DateInputField name="supportStart" label="Support mulai" />
        <DateInputField name="supportEnd" label="Support berakhir" />
        <DateInputField name="warrantyStart" label="Warranty mulai" />
        <DateInputField name="warrantyEnd" label="Warranty berakhir" />
        <TextInputField name="warrantyNote" label="Catatan warranty" className="sm:col-span-2" />
        <TextareaField name="notes" label="Catatan" className="sm:col-span-2" />
      </div>
    </FormDialog>
  );
}

export function DeleteAssetButton({ asset }: { asset: AssetRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, notify } = useFeedback();
  // Unit yang punya riwayat (serah terima lama / peminjaman) tidak bisa dihapus — dicek juga di server.
  if (asset.assignmentCount > 0 || asset.loanCount > 0) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={`Hapus ${asset.deviceName}`}
      onClick={async () => {
        const ok = await confirm({ title: `Hapus ${asset.deviceName}?`, description: `Serial number ${asset.serialNo}.`, confirmLabel: "Hapus", tone: "danger" });
        if (!ok) return;
        startTransition(async () => {
          const result = await deleteAssetAction(asset.id);
          if (result.ok) {
            notify(`${asset.deviceName} dihapus`);
            router.refresh();
          } else notify(result.error, "danger");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 />}
    </Button>
  );
}
