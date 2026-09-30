"use client";

import { useMemo } from "react";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { FileChip } from "@/components/shared/file-chip";
import { PersonCell } from "@/components/shared/person-cell";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn, dataTableColumnHelper } from "@/components/table/data-table";
import { formatDate, formatRupiah } from "@/lib/format";
import type { HealthClaimRow } from "@/lib/services/health-queries";

const col = dataTableColumnHelper<HealthClaimRow>();
const monthLabel = (yearMonth: string) => formatDate(`${yearMonth}-01T00:00:00Z`, "short").replace(/^1 /, "");

const numberColumn = col.accessor("number", {
  header: "Nomor & Tanggal",
  cell: ({ row }) => (
    <div>
      <p className="font-semibold whitespace-nowrap">{row.original.number}</p>
      <p className="text-xs whitespace-nowrap text-muted-foreground">{formatDate(`${row.original.claimDate}T00:00:00Z`, "short")}</p>
    </div>
  ),
});
const requesterColumn = col.accessor("employeeName", {
  header: "Karyawan",
  cell: ({ row }) => <PersonCell name={row.original.employeeName} subtitle={row.original.employeePosition} />,
});
const restColumns = [
  col.accessor("categoryName", { header: "Kategori" }),
  col.accessor("amount", {
    header: "Nominal",
    enableGlobalFilter: false,
    // v1.14: nominal diajukan & nominal disetujui.
    cell: ({ row }) => {
      const { amount, approvedAmount } = row.original;
      return (
        <div className="whitespace-nowrap tabular-nums">
          <p className="font-semibold">{formatRupiah(approvedAmount ?? amount)}</p>
          {approvedAmount !== null && approvedAmount !== amount && (
            <p className="text-xs text-muted-foreground">
              diajukan <span className="line-through">{formatRupiah(amount)}</span>
            </p>
          )}
          {approvedAmount === null && <p className="text-xs text-muted-foreground">diajukan</p>}
        </div>
      );
    },
  }),
  col.display({
    id: "invoice",
    header: "Invoice",
    cell: ({ row }) => <FileChip fileKey={row.original.invoiceFileKey} fileName={row.original.invoiceFileName} className="max-w-40" />,
  }),
  col.accessor((row) => requestStatusBadge(row.status, row.currentLevel).label, {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const badge = requestStatusBadge(row.original.status, row.original.currentLevel);
      return <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>;
    },
  }),
  col.display({
    id: "payouts",
    header: "Jadwal Bayar",
    cell: ({ row }) =>
      row.original.payouts.length ? (
        <ul className="space-y-0.5 text-xs whitespace-nowrap">
          {row.original.payouts.map((p) => (
            <li key={p.month} className={p.paid ? "text-success" : undefined}>
              {monthLabel(p.month)}: {formatRupiah(p.amount)}
              {p.paid && " ✓"}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  }),
];

export function HealthClaimTable({ rows, showRequester }: { rows: HealthClaimRow[]; showRequester: boolean }) {
  const columns = useMemo(
    () => [numberColumn, ...(showRequester ? [requesterColumn] : []), ...restColumns] as DataTableColumn<HealthClaimRow>[],
    [showRequester],
  );
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Cari nomor, karyawan, kategori…"
      rowNoun="klaim"
      emptyMessage="Belum ada klaim kesehatan."
    />
  );
}
