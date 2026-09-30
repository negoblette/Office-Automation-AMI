"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ApprovalStepper } from "@/components/shared/approval-stepper";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { FilterPills } from "@/components/shared/filter-pills";
import { PersonCell } from "@/components/shared/person-cell";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, dataTableColumnHelper } from "@/components/table/data-table";
import type { ApprovalModule } from "@/generated/prisma/enums";
import { APPROVAL_MODULE_META } from "@/lib/approval-modules";
import { formatDateTime } from "@/lib/format";
import type { ApprovalRow } from "@/lib/services/approval-queries";
import { ApproveButton } from "./approve-button";

const col = dataTableColumnHelper<ApprovalRow>();

const requesterColumn = col.accessor((row) => `${row.requesterName} ${row.requesterPosition ?? ""}`, {
  id: "requester",
  header: "Pemohon",
  sortFn: (a, b) => a.original.requesterName.localeCompare(b.original.requesterName, "id"),
  cell: ({ row }) => <PersonCell name={row.original.requesterName} subtitle={row.original.requesterPosition} />,
});

const moduleColumn = col.accessor((row) => APPROVAL_MODULE_META[row.module].label, {
  id: "module",
  header: "Kategori",
  cell: ({ getValue }) => (
    <StatusBadge variant="info" dot={false}>
      {getValue()}
    </StatusBadge>
  ),
});

const numberColumn = col.accessor("entityNumber", {
  header: "Nomor",
  cell: ({ row }) => (
    <Link href={APPROVAL_MODULE_META[row.original.module].path(row.original.entityId)} className="font-medium whitespace-nowrap hover:underline">
      {row.original.entityNumber}
    </Link>
  ),
});

const submittedColumn = col.accessor("createdAt", {
  header: "Diajukan",
  enableGlobalFilter: false,
  cell: ({ getValue }) => <span className="whitespace-nowrap">{formatDateTime(getValue())}</span>,
});

const flowColumn = col.display({
  id: "flow",
  header: "Alur Approval",
  cell: ({ row }) => <ApprovalStepper compact steps={row.original.steps} requestStatus={row.original.status} />,
});

const queueColumns = col.columns([
  requesterColumn,
  moduleColumn,
  numberColumn,
  submittedColumn,
  flowColumn,
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Aksi</span>,
    cell: ({ row }) =>
      row.original.canApprove && (
        <ApproveButton
          requestId={row.original.id}
          label={`${APPROVAL_MODULE_META[row.original.module].label} ${row.original.entityNumber}`}
          requestedAmount={row.original.requestedAmount}
        />
      ),
  }),
]);

const monitorColumns = col.columns([
  numberColumn,
  requesterColumn,
  moduleColumn,
  submittedColumn,
  col.accessor((row) => requestStatusBadge(row.status, row.currentLevel).label, {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const badge = requestStatusBadge(row.original.status, row.original.currentLevel);
      return <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>;
    },
  }),
  flowColumn,
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Aksi</span>,
    cell: ({ row }) =>
      row.original.canApprove && (
        <ApproveButton
          requestId={row.original.id}
          label={`${APPROVAL_MODULE_META[row.original.module].label} ${row.original.entityNumber}`}
          requestedAmount={row.original.requestedAmount}
        />
      ),
  }),
]);

type ModuleFilter = "ALL" | ApprovalModule;

function moduleOptions(rows: ApprovalRow[]) {
  const modules = Object.keys(APPROVAL_MODULE_META) as ApprovalModule[];
  return [
    { value: "ALL" as ModuleFilter, label: "Semua", count: rows.length },
    ...modules
      .map((module) => ({ value: module as ModuleFilter, label: APPROVAL_MODULE_META[module].label, count: rows.filter((r) => r.module === module).length }))
      .filter((option) => option.count > 0),
  ];
}

/** Antrian milik Admin yang login (desain 01: "Antrian Persetujuan Butuh Tindakan"). */
export function ApprovalQueueTable({ rows }: { rows: ApprovalRow[] }) {
  const [module, setModule] = useState<ModuleFilter>("ALL");
  const data = useMemo(() => (module === "ALL" ? rows : rows.filter((r) => r.module === module)), [rows, module]);
  return (
    <div className="flex flex-col gap-4">
      <FilterPills label="Filter" value={module} onChange={setModule} options={moduleOptions(rows)} />
      <DataTable
        columns={queueColumns}
        data={data}
        getRowId={(row) => row.id}
        searchPlaceholder="Cari pemohon atau nomor…"
        rowNoun="antrian"
        emptyMessage="Tidak ada pengajuan yang menunggu persetujuan Anda."
      />
    </div>
  );
}

type StatusFilter = "ALL" | "PENDING" | "APPROVED";

/** Monitor semua pengajuan. */
export function ApprovalMonitorTable({ rows }: { rows: ApprovalRow[] }) {
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const data = useMemo(() => (status === "ALL" ? rows : rows.filter((r) => r.status === status)), [rows, status]);
  return (
    <div className="flex flex-col gap-4">
      <FilterPills
        label="Status"
        value={status}
        onChange={setStatus}
        options={[
          { value: "ALL", label: "Semua", count: rows.length },
          { value: "PENDING", label: "Menunggu", count: rows.filter((r) => r.status === "PENDING").length },
          { value: "APPROVED", label: "Disetujui", count: rows.filter((r) => r.status === "APPROVED").length },
        ]}
      />
      <DataTable
        columns={monitorColumns}
        data={data}
        getRowId={(row) => row.id}
        searchPlaceholder="Cari nomor, pemohon, kategori…"
        rowNoun="pengajuan"
        emptyMessage="Belum ada pengajuan."
      />
    </div>
  );
}
