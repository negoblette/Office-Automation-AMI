"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterPills } from "@/components/shared/filter-pills";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, dataTableColumnHelper } from "@/components/table/data-table";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_LOAN_STATUS_LABEL, DEMO_LOAN_STATUS_VARIANT, DUE_SOON_DAYS, dueLabel, loanPurposeText } from "@/lib/demo-loan";
import { formatDate } from "@/lib/format";
import type { LoanRow } from "@/lib/services/demo-loan-queries";
import { cn } from "@/lib/utils";

const col = dataTableColumnHelper<LoanRow>();
const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

type Filter = "ALL" | "MINE" | "PENDING" | "APPROVED" | "ON_LOAN" | "OVERDUE" | "PICKUP" | "RETURN_REVIEW" | "FOLLOW_UP" | "REJECTED" | "DONE";

const matches = (row: LoanRow, filter: Filter, userId: string) => {
  switch (filter) {
    case "ALL":
      return true;
    case "MINE":
      return row.requesterId === userId;
    case "OVERDUE":
      return row.overdue;
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
 * Operational (`isOperational`, Admin tidak otomatis) langsung disaring ke pekerjaannya: "Disiapkan" bila ada yang perlu
 * disiapkan, lalu "Pengambilan" (menunggu Pengecekan Unit), lalu "Tindak lanjut" (unit rusak / tidak lengkap).
 */
export function LoanTable({ rows, userId, isOperational }: { rows: LoanRow[]; userId: string; isOperational: boolean }) {
  const work = (["APPROVED", "PICKUP", "FOLLOW_UP"] as const).find((status) => rows.some((row) => row.status === status));
  const initial: Filter = isOperational && work ? work : "ALL";
  const [filter, setFilter] = useState<Filter>(initial);
  const data = useMemo(() => rows.filter((row) => matches(row, filter, userId)), [rows, filter, userId]);
  const count = (value: Filter) => rows.filter((row) => matches(row, value, userId)).length;

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor((row) => `${row.borrowerName} ${row.contactName} ${row.number} ${loanPurposeText(row.purpose, row.purposeDetail)}`, {
          id: "borrower",
          header: "Peminjam",
          sortFn: (a, b) => a.original.borrowerName.localeCompare(b.original.borrowerName, "id"),
          cell: ({ row }) => (
            <div className="min-w-0">
              <Link href={`/inventory/peminjaman/${row.original.id}`} className="font-semibold text-ink underline-offset-4 hover:underline">
                {row.original.borrowerName}
              </Link>
              <p className="text-xs text-ink-3">
                {loanPurposeText(row.original.purpose, row.original.purposeDetail)} · up: {row.original.contactName}
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
              {row.original.daysLeft !== null && row.original.daysLeft <= DUE_SOON_DAYS && (
                <p className={cn("text-xs font-semibold", row.original.daysLeft < 0 ? "text-red-ink" : "text-amber-deep")}>
                  {row.original.daysLeft < 0 ? `Terlambat ${-row.original.daysLeft} hari` : `Jatuh tempo ${dueLabel(row.original.daysLeft)}`}
                </p>
              )}
              {row.original.status === "PICKUP" && row.original.pickupDate && (
                <p className="text-xs font-semibold text-brand-deep">Diambil {date(row.original.pickupDate)}</p>
              )}
            </div>
          ),
        }),
        col.accessor((row) => `${row.requesterName} ${row.picName}`, {
          id: "requester",
          header: "Pemohon",
          cell: ({ row }) => (
            <div>
              <p>{row.original.requesterName}</p>
              <p className="text-xs text-ink-3">PIC: {row.original.picName}</p>
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
                {!isOperational ? "Detail" : ({ APPROVED: "Siapkan", PICKUP: "Cek Unit", FOLLOW_UP: "Tindak Lanjut" } as Partial<Record<LoanRow["status"], string>>)[row.original.status] ?? "Detail"}
                <ChevronRight aria-hidden />
              </Link>
            </div>
          ),
        }),
      ]),
    [isOperational],
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
          ...(count("OVERDUE") ? [{ value: "OVERDUE" as const, label: "Terlambat", count: count("OVERDUE") }] : []),
          { value: "PICKUP", label: "Pengambilan", count: count("PICKUP") },
          ...(count("RETURN_REVIEW") ? [{ value: "RETURN_REVIEW" as const, label: "Menunggu verifikasi", count: count("RETURN_REVIEW") }] : []),
          ...(count("FOLLOW_UP") ? [{ value: "FOLLOW_UP" as const, label: "Tindak lanjut", count: count("FOLLOW_UP") }] : []),
          { value: "REJECTED", label: "Ditolak", count: count("REJECTED") },
          { value: "DONE", label: "Selesai / batal", count: count("DONE") },
        ]}
      />
      <DataTable
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        searchPlaceholder="Cari perusahaan, kontak, nomor form, unit…"
        rowNoun="peminjaman"
        emptyMessage={rows.length ? "Tidak ada peminjaman dengan status ini." : "Belum ada pengajuan peminjaman."}
      />
    </div>
  );
}
