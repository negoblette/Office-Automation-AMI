"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { FilterPills } from "@/components/shared/filter-pills";
import { PersonCell } from "@/components/shared/person-cell";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn, dataTableColumnHelper } from "@/components/table/data-table";
import { buttonVariants } from "@/components/ui/button";
import { formatDate, formatRupiah } from "@/lib/format";
import type { HealthClaimRow } from "@/lib/services/health-queries";
import { ExportLinks } from "@/components/shared/export-selector";
import { PersonFilter } from "@/components/shared/person-filter";
import { HealthClaimDialog } from "./claim-form";

const col = dataTableColumnHelper<HealthClaimRow>();
const monthLabel = (yearMonth: string) => formatDate(`${yearMonth}-01T00:00:00Z`, "short").replace(/^1 /, "");

// Klik nomor → halaman detail klaim (2026-11-20, seperti reimburse). Draft (2026-11-23) belum bernomor: "Draft" + tanggal
// klaim, atau tanggal dibuat bila draft belum lengkap.
const numberColumn = col.accessor((row) => row.number ?? "Draft", {
  id: "number",
  header: "Nomor & Tanggal",
  cell: ({ row }) => (
    <Link href={`/kesehatan/${row.original.id}`} className="block hover:underline">
      <p className="font-semibold whitespace-nowrap">{row.original.number ?? "Draft"}</p>
      <p className="text-xs whitespace-nowrap text-muted-foreground">
        {row.original.claimDate ? formatDate(`${row.original.claimDate}T00:00:00Z`, "short") : `Dibuat ${formatDate(row.original.createdAt, "short")}`}
      </p>
    </Link>
  ),
});
const requesterColumn = col.accessor("employeeName", {
  header: "Karyawan",
  cell: ({ row }) => <PersonCell name={row.original.employeeName} subtitle={row.original.employeePosition} />,
});
const restColumns = [
  col.accessor("categoryName", {
    header: "Kategori",
    cell: ({ row }) => (
      <div className="max-w-64">
        <p className="truncate" title={row.original.categoryName}>
          {row.original.categoryName}
        </p>
        {row.original.items.length > 1 && (
          <p
            className="cursor-help text-xs text-muted-foreground underline decoration-dotted underline-offset-2"
            title={row.original.items.map((item) => `${formatDate(`${item.date}T00:00:00Z`, "short")} · ${item.categoryName} · ${formatRupiah(item.amount)}${item.note ? ` · ${item.note}` : ""}`).join("\n")}
          >
            {row.original.items.length} baris
          </p>
        )}
      </div>
    ),
  }),
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
          {approvedAmount === null && <p className="text-xs text-muted-foreground">{row.original.status === "DRAFT" ? "belum diajukan" : "diajukan"}</p>}
        </div>
      );
    },
  }),
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

/** Data form untuk tombol Revisi (klaim milik sendiri yang ditolak). */
export type ClaimReviseContext = { categories: { value: string; label: string }[]; remaining: number };

type StatusFilter = "ALL" | "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";

export function HealthClaimTable({ rows, showRequester, revise }: { rows: HealthClaimRow[]; showRequester: boolean; revise?: ClaimReviseContext }) {
  // Filter status (2026-11-23, sama dengan reimburse) & per nama karyawan (2026-11-09, Admin).
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [person, setPerson] = useState("");
  const people = useMemo(() => [...new Map(rows.map((row) => [row.employeeId, row.employeeName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "id")), [rows]);
  const data = useMemo(
    () => rows.filter((row) => (status === "ALL" || row.status === status) && (!person || row.employeeId === person)),
    [rows, status, person],
  );
  const count = (s: StatusFilter) => rows.filter((row) => row.status === s).length;
  const columns = useMemo(
    () =>
      [
        numberColumn,
        ...(showRequester ? [requesterColumn] : []),
        ...restColumns,
        col.display({
          id: "actions",
          header: () => <span className="sr-only">Aksi</span>,
          cell: ({ row }) => (
            <div className="flex flex-col items-end gap-2">
              {/* Ekspor klaim ini (2026-11-09). */}
              {(row.original.status === "PENDING" || row.original.status === "APPROVED") && <ExportLinks compact ids={[row.original.id]} pdfPath="/cetak/kesehatan" excelPath="/api/export/kesehatan" />}
              {revise && row.original.own && row.original.status === "REJECTED" && (
                <HealthClaimDialog
                  {...revise}
                  claim={{
                    id: row.original.id,
                    number: row.original.number,
                    status: "REJECTED",
                    items: row.original.items,
                    note: row.original.note,
                  }}
                />
              )}
              {/* Draft (2026-11-23): dilanjutkan / diajukan / dihapus dari halaman detailnya, seperti reimburse. */}
              {row.original.own && row.original.status === "DRAFT" && (
                <Link href={`/kesehatan/${row.original.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <Pencil aria-hidden /> {row.original.incomplete ? "Lanjutkan Mengisi" : "Buka Draft"}
                </Link>
              )}
            </div>
          ),
        }),
      ] as DataTableColumn<HealthClaimRow>[],
    [showRequester, revise],
  );
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
          { value: "REJECTED", label: "Ditolak", count: count("REJECTED"), danger: count("REJECTED") > 0 },
        ]}
      />
      <DataTable
        columns={columns}
        data={data}
        toolbar={showRequester && <PersonFilter value={person} onChange={setPerson} people={people} />}
        getRowId={(row) => row.id}
        searchPlaceholder="Cari nomor, karyawan, kategori…"
        rowNoun="klaim"
        emptyMessage="Belum ada klaim kesehatan."
      />
    </div>
  );
}
