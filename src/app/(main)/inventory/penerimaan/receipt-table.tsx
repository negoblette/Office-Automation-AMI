"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { DataTable, dataTableColumnHelper } from "@/components/table/data-table";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { ASSET_OWNERSHIP_LABEL } from "@/lib/inventory";
import type { GoodsReceiptRow } from "@/lib/services/goods-receipt-queries";

const col = dataTableColumnHelper<GoodsReceiptRow>();
const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

/** Daftar penerimaan barang principal / distributor (2026-11-20), terbaru dulu. */
export function ReceiptTable({ rows }: { rows: GoodsReceiptRow[] }) {
  const columns = useMemo(
    () =>
      col.columns([
        col.accessor((row) => `${row.ownerName} ${row.contactName} ${row.hafNumber} ${row.unitSummary}`, {
          id: "from",
          header: "Dari",
          sortFn: (a, b) => a.original.ownerName.localeCompare(b.original.ownerName, "id"),
          cell: ({ row }) => (
            <div className="min-w-0">
              <Link href={`/inventory/penerimaan/${row.original.id}`} className="font-semibold text-ink underline-offset-4 hover:underline">
                {row.original.ownerName}
              </Link>
              <p className="text-xs text-ink-3">
                {ASSET_OWNERSHIP_LABEL[row.original.ownership]} · up: {row.original.contactName}
              </p>
              <p className="font-mono text-xs text-ink-3">{row.original.hafNumber}</p>
            </div>
          ),
        }),
        col.accessor("unitSummary", {
          header: "Unit",
          cell: ({ row }) => (
            <div className="max-w-[18rem]">
              <p className="font-medium wrap-anywhere">{row.original.unitSummary || "—"}</p>
              <p className="text-xs text-ink-3">{row.original.unitCount} unit</p>
            </div>
          ),
        }),
        col.accessor("receivedDate", {
          header: "Diterima",
          enableGlobalFilter: false,
          cell: ({ row }) => <span className="whitespace-nowrap">{date(row.original.receivedDate)}</span>,
        }),
        col.accessor((row) => `${row.picName} ${row.preparedByName}`, {
          id: "pic",
          header: "PIC",
          cell: ({ row }) => (
            <div>
              <p>{row.original.picName}</p>
              <p className="text-xs text-ink-3">Dicatat {row.original.preparedByName}</p>
            </div>
          ),
        }),
        col.display({
          id: "actions",
          header: () => <span className="sr-only">Aksi</span>,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <Link
                href={`/inventory/penerimaan/${row.original.id}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
                aria-label={`Buka penerimaan dari ${row.original.ownerName} (${row.original.hafNumber})`}
              >
                Detail
                <ChevronRight aria-hidden />
              </Link>
            </div>
          ),
        }),
      ]),
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Cari principal / distributor, kontak, nomor HAF, unit…"
      rowNoun="penerimaan"
      emptyMessage="Belum ada penerimaan barang dari principal / distributor."
    />
  );
}
