"use client";

import Link from "next/link";
import { PersonCell } from "@/components/shared/person-cell";
import { DataTable, dataTableColumnHelper } from "@/components/table/data-table";
import { formatDate } from "@/lib/format";
import type { EmployeeListRow } from "@/lib/services/employee-queries";
import { RehireButton } from "../employee-status-actions";
import { DivisionName } from "@/components/shared/division-name";

const col = dataTableColumnHelper<EmployeeListRow>();
const date = (iso: string | null) => (iso ? formatDate(`${iso}T00:00:00Z`, "short") : "—");

const columns = col.columns([
  col.accessor((row) => `${row.fullName} ${row.email}`, {
    id: "person",
    header: "Karyawan",
    sortFn: (a, b) => a.original.fullName.localeCompare(b.original.fullName, "id"),
    cell: ({ row }) => (
      <Link href={`/karyawan/${row.original.id}`} className="hover:underline">
        <PersonCell name={row.original.fullName} subtitle={row.original.email} />
      </Link>
    ),
  }),
  col.accessor((row) => `${row.division} ${row.position}`, {
    id: "division",
    header: "Divisi & Jabatan",
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.position}</p>
        <p className="text-sm text-muted-foreground">
          <DivisionName code={row.original.division} />
        </p>
      </div>
    ),
  }),
  col.accessor("startDate", { header: "Masuk (periode terakhir)", enableGlobalFilter: false, cell: ({ getValue }) => date(getValue()) }),
  col.accessor("endDate", { header: "Keluar", enableGlobalFilter: false, cell: ({ getValue }) => date(getValue()) }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Aksi</span>,
    cell: ({ row }) => (
      <RehireButton employeeId={row.original.id} name={row.original.fullName} lastEndDate={row.original.endDate} size="sm" />
    ),
  }),
]);

export function ArchiveTable({ rows }: { rows: EmployeeListRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Cari nama, email, jabatan…"
      rowNoun="karyawan"
      emptyMessage="Belum ada karyawan yang resign."
    />
  );
}
