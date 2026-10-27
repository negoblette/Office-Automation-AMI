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
import { Fragment } from "react";
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
  /**
   * Tampilan di bawah 768 px (audit UI 2026-10-27). `cards` (default): tiap baris jadi kartu — kolom pertama
   * judul, kolom berjudul teks jadi label/nilai, kolom aksi (id `actions` / judul bukan teks) di bawah — tanpa
   * geser ke samping. `table`: tetap tabel yang bisa digeser.
   */
  mobileLayout?: "cards" | "table";
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
  mobileLayout = "cards",
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
  const cards = mobileLayout === "cards";
  const rows = table.getRowModel().rows;
  const emptyText = globalFilter ? `Tidak ada hasil untuk "${globalFilter}".` : emptyMessage;

  // Urutkan versi HP: judul kolom tidak tampil di kartu, jadi pengurutan lewat pilihan.
  const sortableColumns = table.getAllLeafColumns().filter((column) => column.getCanSort() && typeof column.columnDef.header === "string");
  const currentSort = table.state.sorting?.[0];
  const sortValue = currentSort ? `${currentSort.id}:${currentSort.desc ? "desc" : "asc"}` : "";

  return (
    // Versi tenang: tabel langsung di lembar (tanpa kartu); kotak cari & tabel sama dengan antrian Dashboard.
    <div className="min-w-0">
      {(searchPlaceholder || toolbar || (cards && sortableColumns.length > 0)) && (
        <div className="flex flex-col gap-3 pb-3.5 sm:flex-row sm:flex-wrap sm:items-center">
          {searchPlaceholder && (
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-ink-3" aria-hidden />
              <Input
                type="search"
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
          {cards && sortableColumns.length > 0 && (
            <label className="flex items-center gap-2.5 text-[13px] font-bold text-ink-2 md:hidden">
              Urutkan
              <select
                value={sortValue}
                onChange={(event) => {
                  const [id, direction] = event.target.value.split(":");
                  table.setSorting(id ? [{ id, desc: direction === "desc" }] : []);
                  table.setPageIndex(0);
                }}
                className="h-11 min-w-0 flex-1 cursor-pointer rounded-[14px] border-0 bg-white px-3 text-base font-medium text-ink shadow-[inset_0_0_0_1px_var(--edge)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--brand),0_0_0_4px_var(--brand-ring)]"
              >
                <option value="">Bawaan</option>
                {sortableColumns.map((column) => (
                  <Fragment key={column.id}>
                    <option value={`${column.id}:asc`}>{String(column.columnDef.header)} — naik (A–Z)</option>
                    <option value={`${column.id}:desc`}>{String(column.columnDef.header)} — turun (Z–A)</option>
                  </Fragment>
                ))}
              </select>
            </label>
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{toolbar}</div>}
        </div>
      )}

      {cards && (
        <div className="md:hidden">
          {rows.length ? (
            <ul className="flex flex-col gap-2.5">
              {rows.map((row) => {
                const [first, ...rest] = row.getAllCells();
                const fields = rest.filter((cell) => cell.column.id !== "actions" && typeof cell.column.columnDef.header === "string");
                const actions = rest.filter((cell) => !fields.includes(cell));
                return (
                  <li key={row.id} className="flex min-w-0 flex-col gap-3 rounded-[18px] bg-card p-4 shadow-[inset_0_0_0_1px_var(--line)]">
                    {first && (
                      <div className="min-w-0 wrap-anywhere">
                        <table.FlexRender cell={first} />
                      </div>
                    )}
                    {fields.length > 0 && (
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        {fields.map((cell) => (
                          <div key={cell.id} className="flex min-w-0 flex-col gap-1">
                            <dt className="text-[12px] font-bold tracking-[0.02em] text-ink-3 uppercase">{String(cell.column.columnDef.header)}</dt>
                            <dd className="min-w-0 wrap-anywhere text-ink">
                              <table.FlexRender cell={cell} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {actions.length > 0 && (
                      <div className="-mx-1 flex flex-wrap items-center justify-end gap-2 pt-3 shadow-[inset_0_1px_0_var(--line)]">
                        {actions.map((cell) => (
                          <table.FlexRender key={cell.id} cell={cell} />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-[18px] bg-panel px-4 py-10 text-center text-sm text-ink-3">{emptyText}</p>
          )}
        </div>
      )}

      <div className={cards ? "hidden md:block" : undefined}>
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
          {rows.length ? (
            rows.map((row) => (
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
                {emptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </div>

      <div className="flex flex-col gap-3 px-1 pt-1.5 text-[13px] sm:flex-row sm:items-center sm:justify-between">
        {/* role=status: jumlah hasil pencarian dibacakan pembaca layar tanpa memindah fokus. */}
        <p role="status" className="text-ink-3">
          {describeRange(pageIndex, table.state.pagination.pageSize, totalRows, rowNoun)}
        </p>
        {pageCount > 1 && (
          <nav aria-label="Paginasi" className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              Sebelumnya
            </Button>
            {/* HP: nomor halaman diganti teks ringkas supaya tidak melebar keluar layar. */}
            <span className="px-2 font-semibold text-ink-2 tabular-nums sm:hidden">
              {pageIndex + 1} / {pageCount}
            </span>
            {getPageNumbers(pageIndex + 1, pageCount).map((page, i) =>
              page === "…" ? (
                <span key={`gap-${i}`} className="hidden px-1 text-ink-3 sm:inline">
                  …
                </span>
              ) : (
                <Button
                  key={page}
                  size="sm"
                  variant={page === pageIndex + 1 ? "default" : "ghost"}
                  className={cn("hidden min-w-9 sm:inline-flex", page === pageIndex + 1 && "pointer-events-none")}
                  aria-label={`Halaman ${page}`}
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
