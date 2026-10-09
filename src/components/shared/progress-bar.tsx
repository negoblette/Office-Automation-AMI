import { cn } from "@/lib/utils";

export type ProgressTone = "info" | "success" | "danger" | "warning" | "neutral";

const toneClasses: Record<ProgressTone, string> = {
  info: "bg-brand",
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  neutral: "bg-neutral",
};

type ProgressBarProps = {
  /** Nilai 0–100 (dipotong otomatis ke rentang tersebut). */
  value: number;
  /** Warna bar. Default biru (info). */
  tone?: ProgressTone;
  /** Label untuk pembaca layar. */
  label?: string;
  className?: string;
};

export function ProgressBar({ value, tone = "info", label, className }: ProgressBarProps) {
  const clamped = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn("h-2 w-full overflow-hidden rounded-[4px] bg-line", className)}
    >
      <div
        className={cn("h-full rounded-[4px] transition-[width] duration-[600ms] ease-smooth", toneClasses[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
