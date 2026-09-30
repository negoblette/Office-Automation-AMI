"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

type SelectFieldProps = {
  id?: string;
  options: SelectOption[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  className?: string;
};

/** Dropdown pilihan tunggal (mis. tipe reimburse per divisi). Pakai dengan `Controller`. */
export function SelectField({
  id,
  options,
  value,
  onChange,
  placeholder = "Pilih…",
  disabled,
  className,
  ...aria
}: SelectFieldProps) {
  return (
    <Select items={options} value={value ?? null} onValueChange={(next) => onChange(next as string | null)} disabled={disabled}>
      <SelectTrigger id={id} className={cn("h-10 w-full bg-background", className)} {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
