"use client";

import { Eye, MonitorSmartphone } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterPills } from "@/components/shared/filter-pills";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, dataTableColumnHelper } from "@/components/table/data-table";
import { buttonVariants } from "@/components/ui/button";
import { CERTIFICATE_STATUS_BADGE } from "@/lib/certificate-status";
import { DEMO_LOAN_STATUS_LABEL, DEMO_LOAN_STATUS_VARIANT, RETURN_CONDITION_LABEL, RETURN_CONDITION_VARIANT } from "@/lib/demo-loan";
import { formatDate } from "@/lib/format";
import type { AssetOwnership } from "@/generated/prisma/enums";
import { ASSET_OWNERSHIP_LABEL, ownershipText, rackLocationLabel } from "@/lib/inventory";
import { ASSET_CATEGORY_LABEL } from "@/lib/labels";
import type { AssetRow } from "@/lib/services/asset-queries";
import { AssetFormDialog, DeleteAssetButton, type RackOption } from "./asset-dialogs";

const col = dataTableColumnHelper<AssetRow>();
const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

function EndDate({ iso, status }: { iso: string | null; status: AssetRow["supportStatus"] }) {
  if (!iso || !status) return <span className="text-muted-foreground">—</span>;
  const tone = status === "EXPIRED" ? "text-danger" : status === "EXPIRING" ? "text-warning" : "";
  return (
    <span className={`whitespace-nowrap ${tone}`} title={CERTIFICATE_STATUS_BADGE[status].label}>
      {date(iso)}
      {status !== "ACTIVE" && <span className="block text-xs">{status === "EXPIRED" ? "Berakhir" : "≤ 30 hari lagi"}</span>}
    </span>
  );
}

/** Kondisi saat terakhir kembali dari peminjaman, bila bukan Baik. Catatannya ikut dibaca screen reader & tooltip. */
export function LastReturnBadge({ lastReturn }: { lastReturn: NonNullable<AssetRow["lastReturn"]> }) {
  const label = `Kembali ${RETURN_CONDITION_LABEL[lastReturn.condition].toLowerCase()}`;
  return (
    <span title={lastReturn.note ?? undefined}>
      <StatusBadge variant={RETURN_CONDITION_VARIANT[lastReturn.condition]}>
        {label}
        {lastReturn.note && <span className="sr-only">: {lastReturn.note}</span>}
      </StatusBadge>
    </span>
  );
}

type LocationFilter = "ALL" | "IN_RACK" | "NO_RACK";
type OwnershipFilter = "ALL" | AssetOwnership;

/**
 * Katalog unit & lokasi rak. Serah terima ke karyawan tidak dipakai lagi (2026-11-17: unit dipinjamkan ke perusahaan
 * lain lewat Product Trial Form, Fase 16). Aksi kelola hanya untuk Admin & Operational (`canManage`). Unit titipan
 * principal / distributor dipisahkan dari milik AMI lewat filter Kepemilikan & label di tiap unit.
 */
export function InventoryTable({ rows, racks, canManage }: { rows: AssetRow[]; racks: RackOption[]; canManage: boolean }) {
  const [location, setLocation] = useState<LocationFilter>("ALL");
  const [ownership, setOwnership] = useState<OwnershipFilter>("ALL");
  const data = useMemo(
    () =>
      rows.filter(
        (r) =>
          (location === "ALL" || (location === "IN_RACK" ? r.rackPosition : !r.rackPosition)) && (ownership === "ALL" || r.ownership === ownership),
      ),
    [rows, location, ownership],
  );

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor((row) => `${row.deviceName} ${row.serialNo} ${ownershipText(row.ownership, row.ownerName)}`, {
          id: "device",
          header: "Perangkat & Serial",
          sortFn: (a, b) => a.original.deviceName.localeCompare(b.original.deviceName, "id"),
          cell: ({ row }) => (
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-primary">
                <MonitorSmartphone className="size-4.5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{row.original.deviceName}</p>
                <p className="font-mono text-xs text-muted-foreground">SN: {row.original.serialNo}</p>
                {/* Titipan principal / distributor ditandai; milik AMI tanpa label supaya tabel tetap tenang. */}
                {row.original.ownership !== "AMI" && (
                  <StatusBadge variant="warning" className="mt-1">
                    {ownershipText(row.original.ownership, row.original.ownerName)}
                  </StatusBadge>
                )}
              </div>
            </div>
          ),
        }),
        col.accessor((row) => ASSET_CATEGORY_LABEL[row.category], { id: "category", header: "Kategori" }),
        col.accessor((row) => rackLocationLabel(row.rackName, row.rackPosition) ?? "", {
          id: "location",
          header: "Lokasi",
          sortFn: (a, b) => {
            const x = rackLocationLabel(a.original.rackName, a.original.rackPosition);
            const y = rackLocationLabel(b.original.rackName, b.original.rackPosition);
            // "Tidak di rak" selalu di akhir; sisanya urut alami (Rak 2 sebelum Rak 10, A2 sebelum A10).
            if (!x || !y) return x ? -1 : y ? 1 : 0;
            return x.localeCompare(y, "id", { numeric: true });
          },
          cell: ({ row }) => {
            const label = rackLocationLabel(row.original.rackName, row.original.rackPosition);
            const loan = row.original.activeLoan;
            return (
              <div className="flex flex-col items-start gap-1">
                {label ? <span className="whitespace-nowrap">{label}</span> : <span className="text-muted-foreground">Tidak di rak</span>}
                {/* Unit sedang diajukan / disiapkan / dipinjam (Fase 16) — posisi rak tetap jadi tempat kembalinya. */}
                {loan && (
                  <Link href={`/inventory/peminjaman/${loan.id}`} className="rounded-[8px] outline-none focus-visible:outline-2 focus-visible:outline-ink" title={`Peminjaman ke ${loan.borrowerName}`}>
                    <StatusBadge variant={DEMO_LOAN_STATUS_VARIANT[loan.status]}>{DEMO_LOAN_STATUS_LABEL[loan.status]}</StatusBadge>
                  </Link>
                )}
                {/* Terakhir kembali dari peminjaman dengan catatan (Tahap 16.5) — cek dulu sebelum dipinjamkan lagi. */}
                {!loan && row.original.lastReturn && row.original.lastReturn.condition !== "GOOD" && (
                  <LastReturnBadge lastReturn={row.original.lastReturn} />
                )}
              </div>
            );
          },
        }),
        col.accessor("supportEnd", {
          header: "Support s/d",
          enableGlobalFilter: false,
          cell: ({ row }) => <EndDate iso={row.original.supportEnd} status={row.original.supportStatus} />,
        }),
        col.accessor("warrantyEnd", {
          header: "Warranty s/d",
          enableGlobalFilter: false,
          cell: ({ row }) => <EndDate iso={row.original.warrantyEnd} status={row.original.warrantyStatus} />,
        }),
        col.display({
          id: "actions",
          header: () => <span className="sr-only">Aksi</span>,
          cell: ({ row }) => (
            <div className="flex items-center justify-end gap-1">
              <Link
                href={`/inventory/${row.original.id}`}
                className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                aria-label={`Detail ${row.original.deviceName} ${row.original.serialNo}`}
                title="Detail unit"
              >
                <Eye aria-hidden />
              </Link>
              {canManage && (
                <>
                  <AssetFormDialog asset={row.original} racks={racks} />
                  <DeleteAssetButton asset={row.original} />
                </>
              )}
            </div>
          ),
        }),
      ]),
    [racks, canManage],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <FilterPills
          label="Kepemilikan"
          value={ownership}
          onChange={setOwnership}
          options={[
            { value: "ALL", label: "Semua", count: rows.length },
            ...(["AMI", "PRINCIPAL", "DISTRIBUTOR"] as const).map((value) => ({
              value,
              label: ASSET_OWNERSHIP_LABEL[value],
              count: rows.filter((r) => r.ownership === value).length,
            })),
          ]}
        />
        <FilterPills
          label="Lokasi"
          value={location}
          onChange={setLocation}
          options={[
            { value: "ALL", label: "Semua", count: rows.length },
            { value: "IN_RACK", label: "Di rak", count: rows.filter((r) => r.rackPosition).length },
            { value: "NO_RACK", label: "Tidak di rak", count: rows.filter((r) => !r.rackPosition).length },
          ]}
        />
      </div>
      <DataTable
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        searchPlaceholder="Cari perangkat, serial, rak, principal…"
        rowNoun="unit"
        emptyMessage="Belum ada unit terdaftar."
      />
    </div>
  );
}
