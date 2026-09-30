"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DateInputField, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { Button } from "@/components/ui/button";
import { toJakartaIsoDate } from "@/lib/format";
import { ASSET_CATEGORY_LABEL, toOptions } from "@/lib/labels";
import type { AssetRow } from "@/lib/services/asset-queries";
import { assetSchema, assignAssetSchema, returnAssetSchema } from "@/lib/validators/asset";
import { assignAssetAction, deleteAssetAction, returnAssetAction, saveAssetAction } from "./actions";

/** Daftarkan unit baru / ubah data unit (INV-01). */
export function AssetFormDialog({ asset }: { asset?: AssetRow }) {
  return (
    <FormDialog
      wide
      trigger={
        asset ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${asset.deviceName}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="lg">
            <Plus aria-hidden /> Daftarkan Unit
          </Button>
        )
      }
      title={asset ? `Edit ${asset.deviceName}` : "Daftarkan Unit"}
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
      }}
      submitLabel="Simpan"
      action={(values) => saveAssetAction(asset?.id ?? null, values)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInputField name="deviceName" label="Nama perangkat" required />
        <TextInputField name="serialNo" label="Serial number" required hint="Disimpan dalam huruf besar" />
        <SelectInputField name="category" label="Kategori" required options={toOptions(ASSET_CATEGORY_LABEL)} />
        <div className="hidden sm:block" />
        <DateInputField name="supportStart" label="Support mulai" />
        <DateInputField name="supportEnd" label="Support berakhir" />
        <DateInputField name="warrantyStart" label="Warranty mulai" />
        <DateInputField name="warrantyEnd" label="Warranty berakhir" />
        <TextInputField name="warrantyNote" label="Catatan warranty" className="sm:col-span-2" />
        <TextareaField name="notes" label="Catatan / lokasi" className="sm:col-span-2" />
      </div>
    </FormDialog>
  );
}

/** Serahkan unit ke karyawan (INV-02). */
export function AssignAssetDialog({ asset, employees }: { asset: AssetRow; employees: { value: string; label: string }[] }) {
  return (
    <FormDialog
      trigger={<Button size="sm" className="bg-foreground text-background hover:bg-foreground/90">Pinjamkan</Button>}
      title={`Pinjamkan ${asset.deviceName}`}
      description={`Serial ${asset.serialNo}`}
      schema={assignAssetSchema}
      defaults={{ employeeId: "", assignedAt: toJakartaIsoDate(), note: "" }}
      submitLabel="Pinjamkan"
      action={(values) => assignAssetAction(asset.id, values)}
    >
      <SelectInputField name="employeeId" label="Karyawan" required options={employees} />
      <DateInputField name="assignedAt" label="Tanggal serah" required />
      <TextareaField name="note" label="Catatan (tujuan / klien)" />
    </FormDialog>
  );
}

/** Catat pengembalian unit (INV-02). */
export function ReturnAssetDialog({ asset }: { asset: AssetRow }) {
  return (
    <FormDialog
      trigger={<Button size="sm" variant="outline">Kembalikan</Button>}
      title={`Kembalikan ${asset.deviceName}`}
      description={asset.holder ? `Dipegang ${asset.holder.name}` : undefined}
      schema={returnAssetSchema}
      defaults={{ returnedAt: toJakartaIsoDate(), note: "" }}
      submitLabel="Simpan"
      action={(values) => returnAssetAction(asset.id, values)}
    >
      <DateInputField name="returnedAt" label="Tanggal kembali" required />
      <TextareaField name="note" label="Catatan kondisi (opsional)" />
    </FormDialog>
  );
}

export function DeleteAssetButton({ asset }: { asset: AssetRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (asset.assignmentCount > 0) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={`Hapus ${asset.deviceName}`}
      onClick={() => {
        if (!window.confirm(`Hapus ${asset.deviceName} (${asset.serialNo})?`)) return;
        startTransition(async () => {
          const result = await deleteAssetAction(asset.id);
          if (result.ok) router.refresh();
          else window.alert(result.error);
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
