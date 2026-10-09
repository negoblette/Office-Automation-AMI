"use client";

import {
  type ColumnDef,
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  type RowData,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { describeRange, getPageNumbers } from "./pagination";

/** Fitur tabel (TanStack Table v9): sorting, pencarian global, paginasi. */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

export type DataTableFeatures = typeof dataTableFeatures;
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Column helper untuk DataTable. Contoh di Client Component modul:
 * `const col = dataTableColumnHelper<EmployeeRow>();`
 * `const columns = col.columns([col.accessor("fullName", { header: "Nama" })]);`
 */
export function dataTableColumnHelper<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

type DataTableProps<TData extends RowData> = {
  /**
   * Definisi kolom. Karena berisi fungsi, kolom harus didefinisikan di Client Component
   * modul (mis. `employee-table.tsx`), bukan dikirim dari Server Component.
   */
  columns: DataTableColumn<TData>[];
  /** Data yang sudah aman dikirim ke client (pakai `serializeMoney` untuk BigInt). */
  data: TData[];
  /** Tampilkan kotak pencarian (mencari di semua kolom). */
  searchPlaceholder?: string;
  /** Elemen tambahan di kanan kotak pencarian (filter, tombol). */
  toolbar?: React.ReactNode;
  pageSize?: number;
  /** Kata benda untuk teks paginasi, mis. "karyawan". */
  rowNoun?: string;
  emptyMessage?: string;
  getRowId?: (row: TData) => string;
};

export function DataTable<TData extends RowData>({
  columns,
  data,
  searchPlaceholder,
  toolbar,
  pageSize = 10,
  rowNoun = "data",
  emptyMessage = "Belum ada data.",
  getRowId,
}: DataTableProps<TData>) {
  // State (sorting, pencarian, halaman) dikelola internal oleh tabel.
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
    globalFilterFn: "includesString",
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  const { pageIndex } = table.state.pagination;
  const globalFilter = String(table.state.globalFilter ?? "");
  const pageCount = table.getPageCount();
  const totalRows = table.getFilteredRowModel().rows.length;

  return (
    // Versi tenang: tabel langsung di lembar (tanpa kartu); kotak cari & tabel sama dengan antrian Dashboard.
    <div className="min-w-0">
      {(searchPlaceholder || toolbar) && (
        <div className="flex flex-col gap-3 pb-3.5 sm:flex-row sm:items-center">
          {searchPlaceholder && (
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-ink-3" />
              <Input
                value={globalFilter}
                onChange={(event) => {
                  table.setGlobalFilter(event.target.value);
                  table.setPageIndex(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="bg-panel pl-11 text-sm focus-visible:shadow-[inset_0_0_0_1px_var(--ink),0_0_0_3px_var(--brand-ring)]"
              />
            </div>
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{toolbar}</div>}
        </div>
      )}

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const label = header.isPlaceholder ? null : <table.FlexRender header={header} />;
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                  >
                    {canSort && label ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex min-h-11 items-center gap-1.5 font-bold transition-colors duration-300 ease-smooth hover:text-ink"
                      >
                        {label}
                        {sorted === "asc" ? (
                          <ArrowUp className="size-3.5" />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="size-3.5" />
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-50" />
                        )}
                      </button>
                    ) : (
                      label
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className="whitespace-normal">
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="[&:hover>td]:bg-transparent">
              <TableCell colSpan={columns.length} className="h-28 text-center whitespace-normal text-ink-3">
                {globalFilter ? `Tidak ada hasil untuk "${globalFilter}".` : emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex flex-col gap-3 px-1 pt-1.5 text-[13px] sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-3">{describeRange(pageIndex, table.state.pagination.pageSize, totalRows, rowNoun)}</p>
        {pageCount > 1 && (
          <nav aria-label="Paginasi" className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              Sebelumnya
            </Button>
            {getPageNumbers(pageIndex + 1, pageCount).map((page, i) =>
              page === "…" ? (
                <span key={`gap-${i}`} className="px-1 text-ink-3">
                  …
                </span>
              ) : (
                <Button
                  key={page}
                  size="sm"
                  variant={page === pageIndex + 1 ? "default" : "ghost"}
                  className={cn("min-w-8", page === pageIndex + 1 && "pointer-events-none")}
                  aria-current={page === pageIndex + 1 ? "page" : undefined}
                  onClick={() => table.setPageIndex(page - 1)}
                >
                  {page}
                </Button>
              ),
            )}
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Selanjutnya
            </Button>
          </nav>
        )}
      </div>
    </div>
  );
}
