// Saklar modul. Modul yang ditunda tetap ada kodenya & datanya, hanya disembunyikan dan
// diblokir di server (menu, halaman, aksi, dashboard, job worker).
export const FEATURES = {
  /** Inventory / Demo Unit — DITUNDA (keputusan user 2026-09-25). */
  inventory: false,
} as const;

/** Modul Inventory untuk user ini: saklar global, atau super admin (2026-10-30) yang tetap bisa membukanya. */
export function inventoryEnabled(viewer: { isSuperAdmin: boolean } | null | undefined): boolean {
  return FEATURES.inventory || Boolean(viewer?.isSuperAdmin);
}
