import { cn } from "@/lib/utils";

export type StatusVariant = "success" | "info" | "danger" | "neutral" | "warning";

const variantClasses: Record<StatusVariant, { badge: string; dot: string }> = {
  success: { badge: "bg-success-soft text-success", dot: "bg-success" },
  info: { badge: "bg-info-soft text-info", dot: "bg-info" },
  danger: { badge: "bg-danger-soft text-danger", dot: "bg-danger" },
  warning: { badge: "bg-warning-soft text-warning", dot: "bg-warning" },
  neutral: { badge: "bg-neutral-soft text-neutral", dot: "bg-neutral" },
};

type StatusBadgeProps = {
  variant?: StatusVariant;
  children: React.ReactNode;
  /** Tampilkan titik warna di depan label (default: ya). */
  dot?: boolean;
  className?: string;
};

/**
 * Pill status berwarna. Mapping enum status → variant dibuat per modul
 * (mis. `APPROVED` → success) supaya warna konsisten di semua halaman.
 */
export function StatusBadge({ variant = "neutral", children, dot = true, className }: StatusBadgeProps) {
  const classes = variantClasses[variant];
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
