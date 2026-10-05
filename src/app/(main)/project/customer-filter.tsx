"use client";

import { useRouter } from "next/navigation";

/** Filter project per customer: langsung pindah halaman saat dipilih (tanpa tombol Tampilkan). */
export function CustomerFilter({ customers, value }: { customers: { id: string; name: string }[]; value: string | undefined }) {
  const router = useRouter();
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
      Filter customer
      <select
        value={value ?? ""}
        onChange={(event) => router.push(event.target.value ? `/project?customer=${event.target.value}` : "/project")}
        className="h-10 min-w-56 rounded-lg border border-input bg-background px-3 text-sm tracking-normal text-foreground normal-case"
      >
        <option value="">Semua customer</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
