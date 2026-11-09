"use client";

/** Filter tabel per nama karyawan (2026-11-09). */
export function PersonFilter({ value, onChange, people }: { value: string; onChange: (value: string) => void; people: [string, string][] }) {
  return (
    <select
      aria-label="Filter karyawan"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 min-w-48 rounded-[14px] border-0 bg-white px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_var(--edge)]"
    >
      <option value="">Semua karyawan</option>
      {people.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
}
