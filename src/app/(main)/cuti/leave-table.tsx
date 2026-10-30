"use client";

import { useMemo } from "react";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { PersonCell } from "@/components/shared/person-cell";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn, dataTableColumnHelper } from "@/components/table/data-table";
import { formatDate } from "@/lib/format";
import { LEAVE_TYPE_LABEL } from "@/lib/labels";
import type { LeaveRequestRow } from "@/lib/services/leave-queries";
import { LeaveRequestDialog } from "./leave-form";

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
  col.accessor((row) => LEAVE_TYPE_LABEL[row.type], {
    id: "type",
    header: "Jenis",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="whitespace-nowrap">{LEAVE_TYPE_LABEL[row.original.type]}</span>
        {!row.original.deductBalance && <span className="text-xs whitespace-nowrap text-muted-foreground">Tidak potong saldo</span>}
      </div>
    ),
  }),
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
      return (
        <div className="flex max-w-60 flex-col items-start gap-1">
          <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
          {row.original.rejection && (
            <span className="text-xs text-danger">
              {row.original.rejection.by}: {row.original.rejection.reason}
            </span>
          )}
        </div>
      );
    },
  }),
];

/** Data form untuk tombol Revisi (cuti milik sendiri yang ditolak). */
export type LeaveReviseContext = { holidays: string[]; remaining: number; eligibleFrom: string };

export function LeaveTable({ rows, showRequester, revise }: { rows: LeaveRequestRow[]; showRequester: boolean; revise?: LeaveReviseContext }) {
  const columns = useMemo(
    () =>
      [
        numberColumn,
        ...(showRequester ? [requesterColumn] : []),
        ...restColumns,
        ...(revise
          ? [
              col.display({
                id: "actions",
                header: () => <span className="sr-only">Aksi</span>,
                cell: ({ row }) =>
                  row.original.own && row.original.status === "REJECTED" ? (
                    <LeaveRequestDialog
                      {...revise}
                      revise={{
                        id: row.original.id,
                        number: row.original.number,
                        type: row.original.type,
                        startDate: row.original.startDate,
                        endDate: row.original.endDate,
                        reason: row.original.reason,
                      }}
                    />
                  ) : null,
              }),
            ]
          : []),
      ] as DataTableColumn<LeaveRequestRow>[],
    [showRequester, revise],
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
