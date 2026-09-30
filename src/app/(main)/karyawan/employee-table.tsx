"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SelectField } from "@/components/form/select-field";
import { PersonCell } from "@/components/shared/person-cell";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, dataTableColumnHelper } from "@/components/table/data-table";
import { buttonVariants } from "@/components/ui/button";
import { formatTenure } from "@/lib/format";
import { DIVISION_LABEL, ROLE_LABEL, toOptions } from "@/lib/labels";
import type { EmployeeListRow } from "@/lib/services/employee-queries";

const col = dataTableColumnHelper<EmployeeListRow>();

const columns = col.columns([
  col.accessor((row) => `${row.fullName} ${row.email} ${row.employeeNo ?? ""}`, {
    id: "person",
    header: "Karyawan & Kontak",
    sortFn: (a, b) => a.original.fullName.localeCompare(b.original.fullName, "id"),
    cell: ({ row }) => (
      <Link href={`/karyawan/${row.original.id}`} className="block rounded-md hover:underline">
        <PersonCell
          name={row.original.fullName}
          subtitle={[row.original.employeeNo, row.original.email].filter(Boolean).join(" • ")}
        />
      </Link>
    ),
  }),
  col.accessor((row) => `${DIVISION_LABEL[row.division]} ${row.position}`, {
    id: "division",
    header: "Divisi & Jabatan",
    cell: ({ row }) => (
      <div className="min-w-32">
        <p className="font-medium text-foreground">{row.original.position}</p>
        <p className="text-sm text-muted-foreground">{DIVISION_LABEL[row.original.division]}</p>
      </div>
    ),
  }),
  col.accessor((row) => (row.role ? ROLE_LABEL[row.role] : "—"), {
    id: "role",
    header: "Role",
    cell: ({ getValue }) => <StatusBadge variant={getValue() === "Admin" ? "info" : "neutral"} dot={false}>{getValue()}</StatusBadge>,
  }),
  col.accessor("startDate", {
    header: "Masa Kerja",
    enableGlobalFilter: false,
    cell: ({ getValue }) => {
      const startDate = getValue();
      return startDate ? <span className="whitespace-nowrap">{formatTenure(`${startDate}T00:00:00Z`)}</span> : "—";
    },
  }),
  col.accessor("profilePercent", {
    header: "Data Diri",
    enableGlobalFilter: false,
    cell: ({ row }) => {
      const { profilePercent: percent, profileMissing: missing } = row.original;
      const variant = percent === 100 ? "success" : percent >= 50 ? "warning" : "danger";
      return (
        <span title={missing.length ? `Belum diisi: ${missing.join(", ")}` : "Data diri lengkap"}>
          <StatusBadge variant={variant}>{percent === 100 ? "Lengkap" : `${percent}%`}</StatusBadge>
        </span>
      );
    },
  }),
  col.accessor("documentPercent", {
    header: "Dokumen",
    enableGlobalFilter: false,
    cell: ({ row }) => {
      const { documentPercent: percent, documentMissing: missing } = row.original;
      const variant = percent === 100 ? "success" : percent >= 50 ? "warning" : "danger";
      return (
        <Link
          href={`/karyawan/${row.original.id}?tab=dokumen`}
          title={missing.length ? `Belum ada: ${missing.join(", ")}` : "Dokumen lengkap"}
        >
          <StatusBadge variant={variant}>{percent === 100 ? "Lengkap" : `${percent}%`}</StatusBadge>
        </Link>
      );
    },
  }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Aksi</span>,
    cell: ({ row }) => (
      <Link
        href={`/karyawan/${row.original.id}/edit`}
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        aria-label={`Edit ${row.original.fullName}`}
        title="Edit"
      >
        <Pencil />
      </Link>
    ),
  }),
]);

const divisionOptions = [{ value: "ALL", label: "Semua Divisi" }, ...toOptions(DIVISION_LABEL)];

export function EmployeeTable({ rows }: { rows: EmployeeListRow[] }) {
  const [division, setDivision] = useState("ALL");
  const data = useMemo(() => (division === "ALL" ? rows : rows.filter((row) => row.division === division)), [rows, division]);

  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      searchPlaceholder="Cari nama, email, jabatan…"
      rowNoun="karyawan"
      emptyMessage="Belum ada karyawan aktif."
      toolbar={
        <SelectField
          options={divisionOptions}
          value={division}
          onChange={(value) => setDivision(value ?? "ALL")}
          className="w-44"
          aria-label="Filter divisi"
        />
      }
    />
  );
}
