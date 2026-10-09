import type { CSSProperties } from "react";

/**
 * Urutan gerak masuk (`rise`): jeda = urutan × langkah. Langkahnya 30 ms di halaman kerja
 * (utility `rise` di globals.css) dan 70 ms di Dashboard (dashboard.module.css).
 */
export function riseStyle(order: number): CSSProperties {
  return { "--i": order } as CSSProperties;
}
