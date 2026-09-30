/**
 * Nomor halaman untuk paginasi ringkas, mis. halaman 5 dari 25 →
 * [1, "…", 4, 5, 6, "…", 25]. `current` & hasil berbasis 1.
 */
export function getPageNumbers(current: number, total: number, siblings = 1): (number | "…")[] {
  if (total <= 0) return [];
  // Cukup sedikit halaman → tampilkan semua.
  if (total <= 5 + siblings * 2) return Array.from({ length: total }, (_, i) => i + 1);

  const start = Math.max(2, current - siblings);
  const end = Math.min(total - 1, current + siblings);
  const pages: (number | "…")[] = [1];
  if (start > 2) pages.push("…");
  for (let page = start; page <= end; page++) pages.push(page);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

/** "Menampilkan 11–20 dari 148 data". */
export function describeRange(pageIndex: number, pageSize: number, totalRows: number, noun = "data"): string {
  if (totalRows === 0) return `Tidak ada ${noun}`;
  const from = pageIndex * pageSize + 1;
  const to = Math.min(totalRows, from + pageSize - 1);
  return `Menampilkan ${from}–${to} dari ${totalRows} ${noun}`;
}
