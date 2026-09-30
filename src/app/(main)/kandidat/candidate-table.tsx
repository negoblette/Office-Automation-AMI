"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterPills } from "@/components/shared/filter-pills";
import { PersonCell } from "@/components/shared/person-cell";
import { StatusBadge, type StatusVariant } from "@/components/shared/status-badge";
import { DataTable, dataTableColumnHelper } from "@/components/table/data-table";
import type { CandidateStatus } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/format";
import { CANDIDATE_STATUS_LABEL } from "@/lib/labels";
import type { CandidateRow } from "@/lib/services/candidate-queries";

export const CANDIDATE_STATUS_VARIANT: Record<CandidateStatus, StatusVariant> = {
  APPLIED: "neutral",
  INTERVIEW: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
};

const col = dataTableColumnHelper<CandidateRow>();
const columns = col.columns([
  col.accessor((row) => `${row.fullName} ${row.email}`, {
    id: "candidate",
    header: "Kandidat",
    sortFn: (a, b) => a.original.fullName.localeCompare(b.original.fullName, "id"),
    cell: ({ row }) => (
      <Link href={`/kandidat/${row.original.id}`} className="block hover:underline">
        <PersonCell name={row.original.fullName} subtitle={row.original.email} />
      </Link>
    ),
  }),
  col.accessor("appliedPosition", { header: "Posisi dilamar" }),
  col.accessor((row) => CANDIDATE_STATUS_LABEL[row.status], {
    id: "status",
    header: "Status",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        <StatusBadge variant={CANDIDATE_STATUS_VARIANT[row.original.status]}>{CANDIDATE_STATUS_LABEL[row.original.status]}</StatusBadge>
        {row.original.convertedEmployeeId && (
          <Link href={`/karyawan/${row.original.convertedEmployeeId}`}>
            <StatusBadge variant="info" dot={false}>
              Sudah karyawan
            </StatusBadge>
          </Link>
        )}
      </div>
    ),
  }),
  col.accessor("documentCount", { header: "Dokumen", enableGlobalFilter: false, cell: ({ getValue }) => `${getValue()} file` }),
  col.accessor("createdAt", { header: "Didaftarkan", enableGlobalFilter: false, cell: ({ getValue }) => formatDate(`${getValue()}T00:00:00Z`, "short") }),
]);

type Filter = "ALL" | CandidateStatus;

export function CandidateTable({ rows }: { rows: CandidateRow[] }) {
  const [status, setStatus] = useState<Filter>("ALL");
  const data = useMemo(() => (status === "ALL" ? rows : rows.filter((r) => r.status === status)), [rows, status]);
  return (
    <div className="flex flex-col gap-4">
      <FilterPills
        label="Status"
        value={status}
        onChange={setStatus}
        options={[
          { value: "ALL", label: "Semua", count: rows.length },
          ...(Object.keys(CANDIDATE_STATUS_LABEL) as CandidateStatus[]).map((s) => ({
            value: s,
            label: CANDIDATE_STATUS_LABEL[s],
            count: rows.filter((r) => r.status === s).length,
          })),
        ]}
      />
      <DataTable columns={columns} data={data} getRowId={(row) => row.id} searchPlaceholder="Cari nama, email, posisi…" rowNoun="kandidat" emptyMessage="Belum ada kandidat." />
    </div>
  );
}
