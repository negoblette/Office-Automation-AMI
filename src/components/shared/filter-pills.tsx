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

/** Pilihan filter berbentuk pill dengan jumlah, mis. "Semua (12)". Gaya: pil putih bergaris, aktif = tinta. */
export function FilterPills<T extends string>({ options, value, onChange, label, className }: FilterPillsProps<T>) {
  return (
    <div role="group" aria-label={label ?? "Filter"} className={cn("flex flex-wrap items-center gap-2", className)}>
      {label && <span className="mr-1 text-[13px] font-bold text-ink-3">{label}:</span>}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-3.5 text-[13.5px] font-bold transition-[background-color,color,box-shadow,transform] duration-300 ease-smooth outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink focus-visible:outline-solid active:scale-95",
              active
                ? "bg-ink text-white shadow-[inset_0_0_0_1px_var(--ink)]"
                : option.danger
                  ? "bg-red-soft text-red-deep shadow-[inset_0_0_0_1px_var(--red-soft)] hover:shadow-[inset_0_0_0_1px_var(--red)]"
                  : "bg-white text-ink-2 shadow-[inset_0_0_0_1px_var(--edge)] hover:text-ink hover:shadow-[inset_0_0_0_1px_var(--ink)]",
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
