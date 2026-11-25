"use client";

import { Loader2, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useTransition } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { fieldDescriptionId, FormField } from "@/components/form/form-field";
import { SelectField } from "@/components/form/select-field";
import { useFeedback } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { ownershipText, rackPositions, rackRangeLabel } from "@/lib/inventory";
import { ASSET_CATEGORY_LABEL, toOptions } from "@/lib/labels";
import type { AssetRow } from "@/lib/services/asset-queries";
import { cn } from "@/lib/utils";
import { assetSchema } from "@/lib/validators/asset";
import { deleteAssetAction, updateAssetAction } from "./actions";

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
 * Kepemilikan (2026-11-20): unit yang didaftarkan lewat Daftarkan Unit selalu milik AMI dan kepemilikan tidak bisa
 * diubah — unit principal / distributor dicatat lewat Penerimaan Barang (menerbitkan HAF). Hanya keterangan, bukan isian.
 * Tanpa `asset` = keterangan di halaman Daftarkan Unit.
 */
export function OwnershipNote({ asset, className }: { asset?: AssetRow; className?: string }) {
  if (asset && asset.ownership !== "AMI") {
    return (
      <p className={cn("rounded-xl bg-panel px-4 py-3 text-sm text-ink-2", className)}>
        Kepemilikan: <span className="font-semibold text-ink">{ownershipText(asset.ownership, asset.ownerName)}</span>
        {asset.receipt ? ` · masuk lewat HAF ${asset.receipt.hafNumber}` : ""}. Kepemilikan tidak bisa diubah di sini.
      </p>
    );
  }
  return (
    <p className={cn("rounded-xl bg-info-soft px-4 py-3 text-sm text-ink", className)}>
      {asset ? "Unit milik AMI." : "Untuk unit milik AMI."} Barang dari principal / distributor dicatat lewat{" "}
      <Link href="/inventory/penerimaan" className="font-semibold underline underline-offset-4">
        Penerimaan Barang
      </Link>{" "}
      supaya Hardware Admission Form-nya terbit.
    </p>
  );
}

/** Keterangan isian serial number (opsional sejak 2026-11-25) — sama di Ubah Unit, Daftarkan Unit & Terima Barang. */
export const SERIAL_HINT = "Opsional. Disimpan dalam huruf besar; bila diisi tidak boleh sama dengan unit lain.";

/**
 * Ubah data satu unit (INV-01). Setiap simpan tercatat di Riwayat Unit (siapa, kapan, apa yang berubah). Unit baru
 * didaftarkan lewat halaman Daftarkan Unit (`/inventory/baru`, berbaris, 2026-11-25). `trigger` = tombol pengganti
 * (mis. "Ubah Unit" di halaman detail).
 */
export function AssetFormDialog({ asset, racks, trigger }: { asset: AssetRow; racks: RackOption[]; trigger?: React.ReactElement }) {
  return (
    <FormDialog
      wide
      trigger={
        trigger ?? (
          <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${asset.deviceName}`}>
            <Pencil />
          </Button>
        )
      }
      title={`Ubah ${asset.deviceName}`}
      description="Perubahan tercatat di Riwayat Unit beserta nama Anda."
      schema={assetSchema}
      defaults={{
        deviceName: asset.deviceName,
        serialNo: asset.serialNo ?? "",
        category: asset.category,
        notes: asset.notes ?? "",
        rackId: asset.rackId ?? "",
        rackPosition: asset.rackPosition ?? "",
      }}
      submitLabel="Simpan"
      action={(values) => updateAssetAction(asset.id, values)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <OwnershipNote asset={asset} className="sm:col-span-2" />
        <TextInputField name="deviceName" label="Part number / deskripsi" required placeholder="mis. SFP+ (10G)" />
        <TextInputField name="serialNo" label="Serial number" hint={SERIAL_HINT} />
        <SelectInputField name="category" label="Kategori" required options={toOptions(ASSET_CATEGORY_LABEL)} />
        <RackFields racks={racks} />
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
        const ok = await confirm({ title: `Hapus ${asset.deviceName}?`, description: asset.serialNo ? `Serial number ${asset.serialNo}.` : "Tanpa serial number.", confirmLabel: "Hapus", tone: "danger" });
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
