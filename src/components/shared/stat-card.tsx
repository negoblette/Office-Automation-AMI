import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatCardTone = "info" | "success" | "danger" | "warning" | "neutral";

const iconToneClasses: Record<StatCardTone, string> = {
  info: "bg-info-soft text-primary",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  neutral: "bg-neutral-soft text-neutral",
};

type StatCardProps = {
  /** Label UPPERCASE kecil di kiri atas. */
  label: string;
  /** Angka/nilai besar. */
  value: React.ReactNode;
  /** Satuan kecil di samping nilai, mis. "Hari" atau "/ 12 Hari". */
  unit?: React.ReactNode;
  icon?: LucideIcon;
  tone?: StatCardTone;
  /** Keterangan kecil atau ProgressBar di bawah nilai. */
  footer?: React.ReactNode;
  className?: string;
};

/**
 * Grid kartu berisi jumlah (bukan Rupiah): 2 kolom di HP, kartu ganjil terakhir selebar penuh. Tambahkan
 * jumlah kolom layar lebar, mis. `${STAT_GRID} sm:grid-cols-3`. Kartu Rupiah tetap satu kolom di HP supaya
 * angkanya tidak terpotong.
 */
export const STAT_GRID = "grid grid-cols-2 gap-3 sm:gap-4 max-sm:[&>:last-child:nth-child(odd)]:col-span-2";

/**
 * Kartu angka ringkasan. Di HP (< 640 px) lebih ringkas — padding & angka lebih kecil, ikon hiasan disembunyikan —
 * supaya beberapa kartu tidak memenuhi layar pertama dan isi utama halaman tetap terlihat (audit UI 2026-10-27).
 */
export function StatCard({ label, value, unit, icon: Icon, tone = "info", footer, className }: StatCardProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-2xl bg-card p-4 shadow-card sm:gap-3 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
        {Icon && (
          <div className={cn("hidden size-10 shrink-0 items-center justify-center rounded-xl sm:flex", iconToneClasses[tone])}>
            <Icon className="size-5" aria-hidden />
          </div>
        )}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-2xl font-bold tracking-tight wrap-anywhere text-foreground tabular-nums sm:text-3xl">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </p>
      {footer && <div className="text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}
