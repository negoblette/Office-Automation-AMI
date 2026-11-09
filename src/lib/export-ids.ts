// Pilihan pengajuan untuk ekspor PDF / Excel (2026-11-09): `?ids=a,b,c` dari panel "Pilih & Ekspor" atau tombol ekspor
// per pengajuan. Hak akses tetap dicek di query (selain Admin hanya miliknya sendiri).

/** Batas pengajuan per sekali ekspor. */
export const MAX_EXPORT_IDS = 500;

/** `"a,b,,a"` → `["a", "b"]`: hanya id berformat cuid, unik, maks `MAX_EXPORT_IDS`. */
export function parseExportIds(value: string | null | undefined): string[] {
  if (!value) return [];
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[a-z0-9_]{1,40}$/i.test(id));
  return [...new Set(ids)].slice(0, MAX_EXPORT_IDS);
}

/** Status yang bisa diekspor (2026-11-09): draft & yang ditolak tidak ikut. */
export const EXPORTABLE_STATUSES = ["PENDING", "APPROVED"] as const;

/** Pemilik data yang boleh diekspor viewer: Admin semua, selain itu hanya miliknya. */
export function exportOwnerFilter(viewer: { role: string; employeeId: string | null }) {
  return viewer.role === "ADMIN" ? {} : { employeeId: viewer.employeeId ?? "__none__" };
}
