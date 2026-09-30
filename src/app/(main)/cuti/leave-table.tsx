"use client";

import { useMemo } from "react";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { PersonCell } from "@/components/shared/person-cell";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn, dataTableColumnHelper } from "@/components/table/data-table";
import { formatDate } from "@/lib/format";
import type { LeaveRequestRow } from "@/lib/services/leave-queries";

const col = dataTableColumnHelper<LeaveRequestRow>();
const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

const numberColumn = col.accessor("number", {
  header: "Nomor",
  cell: ({ getValue }) => <span className="font-medium whitespace-nowrap">{getValue()}</span>,
});
const requesterColumn = col.accessor("employeeName", {
  header: "Karyawan",
  cell: ({ row }) => <PersonCell name={row.original.employeeName} subtitle={row.original.employeePosition} />,
});
const restColumns = [
  col.accessor("startDate", {
    header: "Tanggal",
    enableGlobalFilter: false,
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {row.original.startDate === row.original.endDate ? date(row.original.startDate) : `${date(row.original.startDate)} – ${date(row.original.endDate)}`}
      </span>
    ),
  }),
  col.accessor("workingDays", {
    header: "Hari Kerja",
    enableGlobalFilter: false,
    cell: ({ getValue }) => <span className="tabular-nums">{getValue()} hari</span>,
  }),
  col.accessor("reason", { header: "Alasan", cell: ({ getValue }) => <p className="max-w-72 truncate">{getValue()}</p> }),
  col.accessor((row) => requestStatusBadge(row.status, row.currentLevel).label, {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const badge = requestStatusBadge(row.original.status, row.original.currentLevel);
      return <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>;
    },
  }),
];

export function LeaveTable({ rows, showRequester }: { rows: LeaveRequestRow[]; showRequester: boolean }) {
  const columns = useMemo(
    () => [numberColumn, ...(showRequester ? [requesterColumn] : []), ...restColumns] as DataTableColumn<LeaveRequestRow>[],
    [showRequester],
  );
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Cari nomor, karyawan, alasan…"
      rowNoun="pengajuan"
      emptyMessage="Belum ada pengajuan cuti."
    />
  );
}
