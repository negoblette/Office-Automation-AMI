// Saklar modul. Modul yang ditunda tetap ada kodenya & datanya, hanya disembunyikan dan
// diblokir di server (menu, halaman, aksi, dashboard, job worker).
export const FEATURES = {
  /**
   * Inventaris / Unit Demo — ditunda 2026-09-25, AKTIF lagi 2026-11-17 (peminjaman unit demo ke perusahaan lain).
   * Siapa yang boleh memakainya diatur per user di services/inventory-access.ts (Admin, Operational, divisi
   * Engineer & Sales); saklar ini hanya menyalakan modulnya (halaman, dashboard Admin, job `reminder.asset`).
   */
  inventory: true,
} as const;

/** Modul Inventaris untuk user ini: saklar global, atau super admin (2026-10-30) yang tetap bisa membukanya. */
export function inventoryEnabled(viewer: { isSuperAdmin: boolean } | null | undefined): boolean {
  return FEATURES.inventory || Boolean(viewer?.isSuperAdmin);
}
