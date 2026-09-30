"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { FilterPills } from "@/components/shared/filter-pills";
import { PersonCell } from "@/components/shared/person-cell";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn, dataTableColumnHelper } from "@/components/table/data-table";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime, formatRupiah } from "@/lib/format";
import type { ReimbursementListRow } from "@/lib/services/reimbursement-queries";

const col = dataTableColumnHelper<ReimbursementListRow>();

const numberColumn = col.accessor((row) => row.number ?? "Draft", {
  id: "number",
  header: "Tiket & Tanggal",
  cell: ({ row }) => (
    <Link href={`/reimburse/${row.original.id}`} className="block hover:underline">
      <p className="font-semibold whitespace-nowrap">{row.original.number ?? "Draft"}</p>
      <p className="text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.submittedAt ?? row.original.createdAt)}</p>
    </Link>
  ),
});

const requesterColumn = col.accessor("employeeName", {
  header: "Pemohon",
  cell: ({ row }) => <PersonCell name={row.original.employeeName} subtitle={row.original.employeePosition} />,
});

const restColumns = [
  col.accessor("summary", {
    header: "Rincian",
    cell: ({ row }) => (
      <div className="max-w-72">
        <p className="truncate">{row.original.summary}</p>
        {row.original.itemCount > 1 && <p className="text-xs text-muted-foreground">+{row.original.itemCount - 1} baris lainnya</p>}
      </div>
    ),
  }),
  col.accessor("total", {
    header: "Nominal",
    enableGlobalFilter: false,
    cell: ({ row }) => (
      <div className="text-right whitespace-nowrap tabular-nums">
        <p className="font-semibold">{formatRupiah(row.original.total)}</p>
        <p className="text-xs text-muted-foreground">
          Cash {formatRupiah(row.original.totalCash)} · CC {formatRupiah(row.original.totalCc)}
        </p>
      </div>
    ),
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
    id: "open",
    header: () => <span className="sr-only">Buka</span>,
    cell: ({ row }) => (
      <Link href={`/reimburse/${row.original.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Buka detail">
        <ChevronRight />
      </Link>
    ),
  }),
];

type StatusFilter = "ALL" | "DRAFT" | "PENDING" | "APPROVED";

export function ReimbursementTable({ rows, showRequester }: { rows: ReimbursementListRow[]; showRequester: boolean }) {
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const data = useMemo(() => (status === "ALL" ? rows : rows.filter((row) => row.status === status)), [rows, status]);
  const columns = useMemo(
    () => [numberColumn, ...(showRequester ? [requesterColumn] : []), ...restColumns] as DataTableColumn<ReimbursementListRow>[],
    [showRequester],
  );
  const count = (s: StatusFilter) => rows.filter((row) => row.status === s).length;

  return (
    <div className="flex flex-col gap-4">
      <FilterPills
        label="Status"
        value={status}
        onChange={setStatus}
        options={[
          { value: "ALL", label: "Semua", count: rows.length },
          { value: "DRAFT", label: "Draft", count: count("DRAFT") },
          { value: "PENDING", label: "Menunggu", count: count("PENDING") },
          { value: "APPROVED", label: "Disetujui", count: count("APPROVED") },
        ]}
      />
      <DataTable
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        searchPlaceholder="Cari nomor, pemohon, rincian…"
        rowNoun="pengajuan"
        emptyMessage="Belum ada pengajuan reimburse."
      />
    </div>
  );
}
