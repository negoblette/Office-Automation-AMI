"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterPills } from "@/components/shared/filter-pills";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, dataTableColumnHelper } from "@/components/table/data-table";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_LOAN_STATUS_LABEL, DEMO_LOAN_STATUS_VARIANT, loanPurposeText } from "@/lib/demo-loan";
import { formatDate } from "@/lib/format";
import type { LoanRow } from "@/lib/services/demo-loan-queries";

const col = dataTableColumnHelper<LoanRow>();
const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

type Filter = "ALL" | "MINE" | "PENDING" | "APPROVED" | "ON_LOAN" | "REJECTED" | "DONE";

const matches = (row: LoanRow, filter: Filter, userId: string) => {
  switch (filter) {
    case "ALL":
      return true;
    case "MINE":
      return row.requesterId === userId;
    case "DONE":
      return row.status === "RETURNED" || row.status === "CANCELLED";
    default:
      return row.status === filter;
  }
};

export function LoanStatus({ status, overdue }: { status: LoanRow["status"]; overdue?: boolean }) {
  return overdue ? <StatusBadge variant="danger">Terlambat</StatusBadge> : <StatusBadge variant={DEMO_LOAN_STATUS_VARIANT[status]}>{DEMO_LOAN_STATUS_LABEL[status]}</StatusBadge>;
}

/**
 * Daftar peminjaman unit (Fase 16.2). Semua user Inventaris melihat semua peminjaman (supaya tahu unit sedang ke mana);
 * Operational & Admin (`canPrepare`) langsung disaring ke "Disiapkan" bila ada peminjaman disetujui yang perlu disiapkan.
 */
export function LoanTable({ rows, userId, canPrepare }: { rows: LoanRow[]; userId: string; canPrepare: boolean }) {
  const toPrepare = rows.some((row) => row.status === "APPROVED");
  const [filter, setFilter] = useState<Filter>(canPrepare && toPrepare ? "APPROVED" : "ALL");
  const data = useMemo(() => rows.filter((row) => matches(row, filter, userId)), [rows, filter, userId]);
  const count = (value: Filter) => rows.filter((row) => matches(row, value, userId)).length;

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor((row) => `${row.borrowerName} ${row.picName} ${row.number} ${loanPurposeText(row.purpose, row.purposeDetail)}`, {
          id: "borrower",
          header: "Peminjam",
          sortFn: (a, b) => a.original.borrowerName.localeCompare(b.original.borrowerName, "id"),
          cell: ({ row }) => (
            <div className="min-w-0">
              <Link href={`/inventory/peminjaman/${row.original.id}`} className="font-semibold text-ink underline-offset-4 hover:underline">
                {row.original.borrowerName}
              </Link>
              <p className="text-xs text-ink-3">
                {loanPurposeText(row.original.purpose, row.original.purposeDetail)} · up: {row.original.picName}
              </p>
              <p className="font-mono text-xs text-ink-3">{row.original.number}</p>
            </div>
          ),
        }),
        col.accessor("itemSummary", {
          header: "Unit",
          cell: ({ row }) => (
            <div className="max-w-[18rem]">
              <p className="font-medium wrap-anywhere">{row.original.itemSummary}</p>
              <p className="text-xs text-ink-3">{row.original.itemCount} unit</p>
            </div>
          ),
        }),
        col.accessor("dueDate", {
          header: "Periode",
          enableGlobalFilter: false,
          cell: ({ row }) => (
            <div className="whitespace-nowrap">
              <p>
                {date(row.original.startDate)} – {date(row.original.dueDate)}
              </p>
              <p className="text-xs text-ink-3">{row.original.durationLabel}</p>
            </div>
          ),
        }),
        col.accessor((row) => `${row.requesterName} ${row.salesPersonName}`, {
          id: "requester",
          header: "Pemohon",
          cell: ({ row }) => (
            <div>
              <p>{row.original.requesterName}</p>
              <p className="text-xs text-ink-3">Sales: {row.original.salesPersonName}</p>
            </div>
          ),
        }),
        col.accessor((row) => DEMO_LOAN_STATUS_LABEL[row.status], {
          id: "status",
          header: "Status",
          cell: ({ row }) => <LoanStatus status={row.original.status} overdue={row.original.overdue} />,
        }),
        col.display({
          id: "actions",
          header: () => <span className="sr-only">Aksi</span>,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <Link
                href={`/inventory/peminjaman/${row.original.id}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
                aria-label={`Buka peminjaman ke ${row.original.borrowerName}`}
              >
                {row.original.status === "APPROVED" && canPrepare ? "Siapkan" : "Detail"}
                <ChevronRight aria-hidden />
              </Link>
            </div>
          ),
        }),
      ]),
    [canPrepare],
  );

  return (
    <div className="flex flex-col gap-4">
      <FilterPills
        label="Tampilkan"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "ALL", label: "Semua", count: rows.length },
          { value: "MINE", label: "Pengajuan saya", count: count("MINE") },
          { value: "PENDING", label: "Menunggu approval", count: count("PENDING") },
          { value: "APPROVED", label: "Disiapkan", count: count("APPROVED") },
          { value: "ON_LOAN", label: "Dipinjam", count: count("ON_LOAN") },
          { value: "REJECTED", label: "Ditolak", count: count("REJECTED") },
          { value: "DONE", label: "Selesai / batal", count: count("DONE") },
        ]}
      />
      <DataTable
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        searchPlaceholder="Cari perusahaan, PIC, nomor form, unit…"
        rowNoun="peminjaman"
        emptyMessage={rows.length ? "Tidak ada peminjaman dengan status ini." : "Belum ada pengajuan peminjaman."}
      />
    </div>
  );
}
