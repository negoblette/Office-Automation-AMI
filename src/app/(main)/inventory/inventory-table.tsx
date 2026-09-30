"use client";

import { History, MonitorSmartphone } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterPills } from "@/components/shared/filter-pills";
import { PersonCell } from "@/components/shared/person-cell";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, dataTableColumnHelper } from "@/components/table/data-table";
import { buttonVariants } from "@/components/ui/button";
import { CERTIFICATE_STATUS_BADGE } from "@/lib/certificate-status";
import { formatDate } from "@/lib/format";
import { ASSET_CATEGORY_LABEL } from "@/lib/labels";
import type { AssetRow } from "@/lib/services/asset-queries";
import { AssetFormDialog, AssignAssetDialog, DeleteAssetButton, ReturnAssetDialog } from "./asset-dialogs";

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

type StatusFilter = "ALL" | "AVAILABLE" | "ASSIGNED";

/** Katalog & peminjaman unit (desain 04). */
export function InventoryTable({ rows, employees }: { rows: AssetRow[]; employees: { value: string; label: string }[] }) {
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const data = useMemo(
    () => rows.filter((r) => status === "ALL" || (status === "ASSIGNED" ? r.holder : !r.holder)),
    [rows, status],
  );

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor((row) => `${row.deviceName} ${row.serialNo}`, {
          id: "device",
          header: "Perangkat & Serial",
          sortFn: (a, b) => a.original.deviceName.localeCompare(b.original.deviceName, "id"),
          cell: ({ row }) => (
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-primary">
                <MonitorSmartphone className="size-4.5" aria-hidden />
              </span>
              <div>
                <p className="font-semibold">{row.original.deviceName}</p>
                <p className="font-mono text-xs text-muted-foreground">SN: {row.original.serialNo}</p>
              </div>
            </div>
          ),
        }),
        col.accessor((row) => ASSET_CATEGORY_LABEL[row.category], { id: "category", header: "Kategori" }),
        col.accessor((row) => (row.holder ? "Dipinjam" : "Tersedia"), {
          id: "status",
          header: "Status",
          cell: ({ row }) =>
            row.original.holder ? <StatusBadge variant="info">Dipinjam</StatusBadge> : <StatusBadge variant="success">Tersedia</StatusBadge>,
        }),
        col.accessor((row) => row.holder?.name ?? "", {
          id: "holder",
          header: "Pemegang",
          cell: ({ row }) =>
            row.original.holder ? (
              <PersonCell name={row.original.holder.name} subtitle={`sejak ${date(row.original.holder.assignedAt)}`} />
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
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
              {row.original.holder ? <ReturnAssetDialog asset={row.original} /> : <AssignAssetDialog asset={row.original} employees={employees} />}
              <Link href={`/inventory/${row.original.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Riwayat" title="Riwayat serah terima">
                <History />
              </Link>
              <AssetFormDialog asset={row.original} />
              <DeleteAssetButton asset={row.original} />
            </div>
          ),
        }),
      ]),
    [employees],
  );

  return (
    <div className="flex flex-col gap-4">
      <FilterPills
        label="Filter"
        value={status}
        onChange={setStatus}
        options={[
          { value: "ALL", label: "Semua", count: rows.length },
          { value: "AVAILABLE", label: "Tersedia", count: rows.filter((r) => !r.holder).length },
          { value: "ASSIGNED", label: "Dipinjam", count: rows.filter((r) => r.holder).length },
        ]}
      />
      <DataTable
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        searchPlaceholder="Cari perangkat, serial, pemegang…"
        rowNoun="unit"
        emptyMessage="Belum ada unit terdaftar."
      />
    </div>
  );
}
