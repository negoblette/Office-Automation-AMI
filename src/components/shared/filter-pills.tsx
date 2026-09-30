"use client";

import { cn } from "@/lib/utils";

export type FilterPillOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
  /** Tandai merah, mis. "Overdue". */
  danger?: boolean;
};

type FilterPillsProps<T extends string> = {
  options: FilterPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
};

/** Pilihan filter berbentuk pill dengan jumlah, mis. "Semua (12)". */
export function FilterPills<T extends string>({ options, value, onChange, label, className }: FilterPillsProps<T>) {
  return (
    <div role="group" aria-label={label ?? "Filter"} className={cn("flex flex-wrap items-center gap-2", className)}>
      {label && <span className="mr-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}:</span>}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-foreground text-background"
                : option.danger
                  ? "bg-danger-soft text-danger hover:bg-danger-soft/70"
                  : "bg-muted text-foreground hover:bg-muted/70",
            )}
          >
            {option.label}
            {option.count !== undefined && ` (${option.count})`}
          </button>
        );
      })}
    </div>
  );
}
