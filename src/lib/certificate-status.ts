// Status sertifikat (URD CERT-02). Tanggal dibandingkan sebagai kalender Jakarta (YYYY-MM-DD).
import type { StatusVariant } from "@/components/shared/status-badge";

export type CertificateStatus = "ACTIVE" | "EXPIRING" | "EXPIRED" | "LIFETIME";

/** Batas "akan kadaluarsa" & reminder email (CERT-03). */
export const EXPIRY_WARNING_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Selisih hari kalender dari `today` ke `endDate` (negatif jika sudah lewat). */
export function daysUntil(endDate: string, today: string): number {
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

/**
 * Tanpa end date → seumur hidup. Kadaluarsa jika end date sudah lewat (berlaku s/d
 * end date). Akan kadaluarsa jika sisa ≤ 30 hari.
 */
export function certificateStatus(endDate: string | null, today: string): CertificateStatus {
  if (!endDate) return "LIFETIME";
  const days = daysUntil(endDate, today);
  if (days < 0) return "EXPIRED";
  if (days <= EXPIRY_WARNING_DAYS) return "EXPIRING";
  return "ACTIVE";
}

export const CERTIFICATE_STATUS_BADGE: Record<CertificateStatus, { label: string; variant: StatusVariant }> = {
  ACTIVE: { label: "Aktif", variant: "success" },
  LIFETIME: { label: "Seumur hidup", variant: "success" },
  EXPIRING: { label: "Akan kadaluarsa", variant: "warning" },
  EXPIRED: { label: "Kadaluarsa", variant: "danger" },
};
