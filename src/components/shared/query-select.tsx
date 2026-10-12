"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Dropdown filter yang langsung mengubah satu query param (?tahun=…, ?customer=…) tanpa tombol
 * "Tampilkan"; param lain di URL dipertahankan. Nilai "" = param dihapus.
 */
export function QuerySelect({
  label,
  param,
  value,
  options,
  emptyLabel,
}: {
  label: string;
  param: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  /** Pilihan "semua" (nilai kosong); tanpa ini dropdown wajib memilih salah satu opsi. */
  emptyLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
      {label}
      <select
        value={value ?? ""}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          if (event.target.value) next.set(param, event.target.value);
          else next.delete(param);
          const query = next.toString();
          router.push(query ? `${pathname}?${query}` : pathname);
        }}
        className="h-10 min-w-40 rounded-lg border border-input bg-background px-3 text-sm tracking-normal text-foreground normal-case"
      >
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
