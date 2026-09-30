// Perhitungan klaim kesehatan murni (tanpa database) — URD HC-05..07, Tech Spec §6.3.
// Nominal dalam rupiah (number; aman sampai ±9 kuadriliun). Bulan berupa "YYYY-MM".
// Plafon hanya TAHUNAN (keputusan user 2026-09-29): tidak ada plafon bulanan; klaim yang
// disetujui dibayar penuh (dijadwalkan di bulan approval).

export function nextMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

// TODO(OI-01): tidak ada carry over plafon kesehatan antar tahun.
/** Sisa plafon tahunan = plafon − klaim APPROVED/PENDING tahun itu (HC-07). */
export function remainingPlafond(annual: number, usedOrPending: number): number {
  return annual - usedOrPending;
}
