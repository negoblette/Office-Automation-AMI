import { cn } from "@/lib/utils";

/** `pending` = menunggu persetujuan (perlu perhatian). */
export type StatusVariant = "success" | "info" | "danger" | "neutral" | "warning" | "pending";

/**
 * Versi tenang (`.tag`): warna hanya untuk arti status — baik, perlu perhatian, salah.
 * Selain itu netral (termasuk `info`: peran, kategori, keterangan).
 */
const tagClasses: Record<StatusVariant, string> = {
  success: "bg-green-soft text-green-deep",
  warning: "bg-amber-soft text-amber-deep",
  pending: "bg-amber-soft text-amber-deep",
  danger: "bg-red-soft text-red-deep",
  neutral: "bg-tone-soft text-ink-2",
  info: "bg-tone-soft text-ink-2",
};

/** Tampilan lama (pil dengan titik), khusus Dashboard yang dikunci. */
const pillClasses: Record<StatusVariant, { badge: string; dot: string }> = {
  success: { badge: "bg-success-soft text-success", dot: "bg-success" },
  info: { badge: "bg-info-soft text-info", dot: "bg-info" },
  pending: { badge: "bg-info-soft text-info", dot: "bg-info" },
  danger: { badge: "bg-danger-soft text-danger", dot: "bg-danger" },
  warning: { badge: "bg-warning-soft text-warning", dot: "bg-warning" },
  neutral: { badge: "bg-neutral-soft text-neutral", dot: "bg-neutral" },
};

type StatusBadgeProps = {
  variant?: StatusVariant;
  children: React.ReactNode;
  /** Titik warna di depan label — hanya pada tampilan `pill` (default: ya). */
  dot?: boolean;
  /** `tag` = versi tenang (default); `pill` = tampilan lama, khusus Dashboard. */
  look?: "tag" | "pill";
  className?: string;
};

/**
 * Label status. Mapping enum status → variant dibuat per modul
 * (mis. `APPROVED` → success) supaya warna konsisten di semua halaman.
 */
export function StatusBadge({ variant = "neutral", children, dot = true, look = "tag", className }: StatusBadgeProps) {
  if (look === "pill") {
    const classes = pillClasses[variant];
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
          classes.badge,
          className,
        )}
      >
        {dot && <span className={cn("size-1.5 rounded-full", classes.dot)} aria-hidden />}
        {children}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-[8px] px-[9px] text-[12.5px] font-bold whitespace-nowrap",
        tagClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
