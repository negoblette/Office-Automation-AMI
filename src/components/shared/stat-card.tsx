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

export function StatCard({ label, value, unit, icon: Icon, tone = "info", footer, className }: StatCardProps) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-card", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
        {Icon && (
          <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", iconToneClasses[tone])}>
            <Icon className="size-5" aria-hidden />
          </div>
        )}
      </div>
      <p className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight text-foreground">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </p>
      {footer && <div className="text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}
