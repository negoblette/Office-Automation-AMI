"use client";

import { Laptop, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEmployeeAssetAction, saveEmployeeAssetAction } from "@/app/(main)/karyawan/asset-actions";
import { DateInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, toJakartaIsoDate } from "@/lib/format";
import type { EmployeeAssetView } from "@/lib/services/employee-asset";
import { employeeAssetSchema } from "@/lib/validators/employee-asset";

const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

function AssetDialog({ employeeId, asset }: { employeeId: string; asset?: EmployeeAssetView }) {
  return (
    <FormDialog
      trigger={
        asset ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${asset.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus aria-hidden /> Aset
          </Button>
        )
      }
      title={asset ? `Ubah ${asset.name}` : "Tambah Aset Karyawan"}
      schema={employeeAssetSchema}
      defaults={{
        name: asset?.name ?? "",
        serialNo: asset?.serialNo ?? "",
        receivedDate: asset?.receivedDate ?? toJakartaIsoDate(),
        returnedDate: asset?.returnedDate ?? "",
        note: asset?.note ?? "",
      }}
      submitLabel="Simpan"
      action={(values) => saveEmployeeAssetAction(employeeId, asset?.id ?? null, values)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInputField name="name" label="Nama barang" required placeholder="mis. Laptop Lenovo T14" />
        <TextInputField name="serialNo" label="Serial number" />
        <DateInputField name="receivedDate" label="Tanggal diterima" required />
        <DateInputField name="returnedDate" label="Tanggal dikembalikan" hint="Kosongkan bila masih dipegang." />
        <TextareaField name="note" label="Catatan" className="sm:col-span-2" />
      </div>
    </FormDialog>
  );
}

function DeleteAssetButton({ asset }: { asset: EmployeeAssetView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={`Hapus ${asset.name}`}
        onClick={() => {
          if (!window.confirm(`Hapus aset "${asset.name}"?`)) return;
          startTransition(async () => {
            const result = await deleteEmployeeAssetAction(asset.id);
            if (result.ok) router.refresh();
            else setError(result.error);
          });
        }}
      >
        <Trash2 />
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </>
  );
}

/** Aset yang dipegang karyawan (Fase 14). `canEdit` = Admin. */
export function EmployeeAssetsPanel({ employeeId, assets, canEdit }: { employeeId: string; assets: EmployeeAssetView[]; canEdit: boolean }) {
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Aset Karyawan</h2>
          <p className="text-sm text-muted-foreground">Barang kantor yang sedang atau pernah dipegang.{!canEdit && " Dicatat oleh Admin."}</p>
        </div>
        {canEdit && <AssetDialog employeeId={employeeId} />}
      </div>
      {assets.length === 0 ? (
        <EmptyState icon={Laptop} title="Belum ada aset tercatat" className="shadow-none" />
      ) : (
        <ul className="divide-y divide-border">
          {assets.map((asset) => (
            <li key={asset.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{asset.name}</p>
                  <StatusBadge variant={asset.returnedDate ? "neutral" : "success"}>{asset.returnedDate ? "Sudah dikembalikan" : "Dipegang"}</StatusBadge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {asset.serialNo && `SN ${asset.serialNo} · `}Diterima {date(asset.receivedDate)}
                  {asset.returnedDate && ` · dikembalikan ${date(asset.returnedDate)}`}
                </p>
                {asset.note && <p className="text-sm text-muted-foreground">{asset.note}</p>}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <AssetDialog employeeId={employeeId} asset={asset} />
                  <DeleteAssetButton asset={asset} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
