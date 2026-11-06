"use client";

import { Laptop, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEmployeeAssetAction, saveEmployeeAssetAction } from "@/app/(main)/karyawan/asset-actions";
import { DateInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useFeedback } from "@/components/shared/feedback";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, toJakartaIsoDate } from "@/lib/format";
import { ASSET_CATEGORY_LABEL } from "@/lib/labels";
import type { AssignmentRow } from "@/lib/services/asset-queries";
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
            <Plus aria-hidden /> Tambah Asset
          </Button>
        )
      }
      title={asset ? `Ubah ${asset.name}` : "Tambah Asset Kantor"}
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
  const { confirm, notify } = useFeedback();
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={`Hapus ${asset.name}`}
        onClick={async () => {
          const ok = await confirm({ title: `Hapus aset "${asset.name}"?`, confirmLabel: "Hapus", tone: "danger" });
          if (!ok) return;
          setError(null);
          startTransition(async () => {
            const result = await deleteEmployeeAssetAction(asset.id);
            if (result.ok) {
              notify("Aset dihapus");
              router.refresh();
            } else setError(result.error);
          });
        }}
      >
        <Trash2 />
      </Button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </>
  );
}

/** Satu baris tampilan: barang yang dicatat langsung, atau unit Inventory yang diserahkan ke karyawan. */
type AssetLine =
  | { source: "manual"; key: string; held: boolean; sortDate: string; asset: EmployeeAssetView }
  | { source: "inventory"; key: string; held: boolean; sortDate: string; assignment: AssignmentRow };

/**
 * Asset Kantor (Fase 14; 2026-11-02 satu tampilan): barang yang dicatat Admin langsung (`EmployeeAsset`, bisa diubah di
 * sini) + unit Inventaris / Unit Demo yang sedang/pernah diserahkan ke karyawan (`AssetAssignment`, diubah lewat modul
 * Inventory). Yang masih dipegang di atas. `canEdit` = Admin; `canOpenInventory` = boleh membuka halaman unit Inventory.
 */
export function EmployeeAssetsPanel({
  employeeId,
  assets,
  inventory = [],
  canEdit,
  canOpenInventory = false,
}: {
  employeeId: string;
  assets: EmployeeAssetView[];
  inventory?: AssignmentRow[];
  canEdit: boolean;
  canOpenInventory?: boolean;
}) {
  const lines: AssetLine[] = [
    ...assets.map((asset) => ({ source: "manual" as const, key: `m-${asset.id}`, held: !asset.returnedDate, sortDate: asset.receivedDate, asset })),
    ...inventory.map((assignment) => ({
      source: "inventory" as const,
      key: `i-${assignment.id}`,
      held: !assignment.returnedAt,
      sortDate: assignment.assignedAt,
      assignment,
    })),
  ].sort((a, b) => Number(b.held) - Number(a.held) || b.sortDate.localeCompare(a.sortDate));
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Asset Kantor</h2>
          <p className="text-sm text-muted-foreground">Barang kantor yang sedang atau pernah dipegang.{!canEdit && " Dicatat oleh Admin."}</p>
        </div>
        {canEdit && <AssetDialog employeeId={employeeId} />}
      </div>
      {lines.length === 0 ? (
        <EmptyState icon={Laptop} title="Belum ada asset tercatat" className="shadow-none" />
      ) : (
        <ul className="divide-y divide-border">
          {lines.map((line) =>
            line.source === "inventory" ? (
              <InventoryLine key={line.key} row={line.assignment} canOpen={canOpenInventory} />
            ) : (
              <ManualLine key={line.key} employeeId={employeeId} asset={line.asset} canEdit={canEdit} />
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function InventoryLine({ row, canOpen }: { row: AssignmentRow; canOpen: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {canOpen ? (
            <Link href={`/inventory/${row.assetId}`} className="font-semibold hover:underline">
              {row.deviceName}
            </Link>
          ) : (
            <p className="font-semibold">{row.deviceName}</p>
          )}
          <StatusBadge variant={row.returnedAt ? "neutral" : "success"}>{row.returnedAt ? "Sudah dikembalikan" : "Dipegang"}</StatusBadge>
          <StatusBadge variant="info" dot={false}>
            {ASSET_CATEGORY_LABEL[row.category]}
          </StatusBadge>
        </div>
        <p className="text-sm text-muted-foreground">
          SN {row.serialNo} · Diterima {date(row.assignedAt)}
          {row.returnedAt && ` · dikembalikan ${date(row.returnedAt)}`}
        </p>
        {row.note && <p className="text-sm text-muted-foreground">{row.note}</p>}
      </div>
      <span className="text-xs text-muted-foreground">Dari Inventaris</span>
    </li>
  );
}

function ManualLine({ employeeId, asset, canEdit }: { employeeId: string; asset: EmployeeAssetView; canEdit: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
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
  );
}
