"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const groupFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

type RupiahInputProps = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
};

/**
 * Input nominal Rupiah: tampil "1.250.000" saat diketik, nilai yang dikirim berupa
 * number (atau null jika kosong). Validasi > 0 tetap lewat `amountSchema`.
 * Pakai dengan `Controller` react-hook-form.
 */
export function RupiahInput({ value, onChange, className, ...props }: RupiahInputProps) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-mono text-[13px] font-semibold text-ink-3">
        Rp
      </span>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value === null || value === undefined ? "" : groupFormat.format(value)}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
          // Batasi 15 digit supaya tetap dalam rentang aman number.
          onChange(digits ? Number(digits.slice(0, 15)) : null);
        }}
        className={cn("pl-11 font-mono tabular-nums", className)}
      />
    </div>
  );
}
