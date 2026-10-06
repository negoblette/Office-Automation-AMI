"use client";

import { useMemo, useState } from "react";
import { FilterPills } from "@/components/shared/filter-pills";
import { formatRupiah } from "@/lib/format";

export type ExpenseShareProject = { id: string; label: string; customerId: string; customerName: string; amount: number };

type Slice = { key: string; label: string; amount: number; color: string };
type Mode = "project" | "customer";

// Palet kategori (urutan tetap, divalidasi CVD — skill dataviz). Maks 7 irisan + "Lainnya" abu-abu.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];
const OTHER = "#a3a39d";
const MAX_SLICES = SERIES.length;

const SIZE = 200;
const R = 90;
const INNER = 56;

function arcPath(start: number, end: number): string {
  // Satu irisan penuh tidak bisa digambar sebagai arc → dua setengah lingkaran.
  if (end - start >= Math.PI * 2 - 1e-6) {
    return [arcPath(start, start + Math.PI), arcPath(start + Math.PI, end)].join(" ");
  }
  const c = SIZE / 2;
  const p = (r: number, a: number) => `${c + r * Math.sin(a)} ${c - r * Math.cos(a)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${p(R, start)} A ${R} ${R} 0 ${large} 1 ${p(R, end)} L ${p(INNER, end)} A ${INNER} ${INNER} 0 ${large} 0 ${p(INNER, start)} Z`;
}

/**
 * Donut persentase total biaya (disetujui) per project / per customer (2026-10-06). Legenda di
 * sampingnya sekaligus tabel nilai (nama, nominal, persen) — warna tidak pernah satu-satunya penanda.
 */
export function ExpenseShareChart({ projects }: { projects: ExpenseShareProject[] }) {
  const [mode, setMode] = useState<Mode>("project");
  const [hover, setHover] = useState<string | null>(null);

  const { slices, total } = useMemo(() => {
    const groups = new Map<string, { label: string; amount: number }>();
    for (const p of projects) {
      if (p.amount <= 0) continue;
      const key = mode === "project" ? p.id : p.customerId;
      const label = mode === "project" ? `${p.label} · ${p.customerName}` : p.customerName;
      const g = groups.get(key) ?? { label, amount: 0 };
      g.amount += p.amount;
      groups.set(key, g);
    }
    // Warna mengikuti entitas (urutan nama), bukan peringkat nominal.
    const sorted = [...groups.entries()].sort(([, a], [, b]) => b.amount - a.amount);
    const top = sorted.slice(0, MAX_SLICES);
    const rest = sorted.slice(MAX_SLICES);
    const colorOrder = [...top].sort(([, a], [, b]) => a.label.localeCompare(b.label, "id"));
    const colorOf = new Map(colorOrder.map(([key], i) => [key, SERIES[i]]));
    const result: Slice[] = top.map(([key, g]) => ({ key, label: g.label, amount: g.amount, color: colorOf.get(key)! }));
    if (rest.length) result.push({ key: "__other__", label: `Lainnya (${rest.length})`, amount: rest.reduce((n, [, g]) => n + g.amount, 0), color: OTHER });
    return { slices: result, total: result.reduce((n, s) => n + s.amount, 0) };
  }, [projects, mode]);

  const pct = (amount: number) => (total ? (amount / total) * 100 : 0);
  const pctText = (amount: number) => `${pct(amount).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
  const active = slices.find((s) => s.key === hover) ?? null;

  // Sudut awal tiap irisan = jumlah irisan sebelumnya.
  const arcs = slices.map((s, i) => {
    const before = slices.slice(0, i).reduce((n, x) => n + x.amount, 0);
    const start = (before / total) * Math.PI * 2;
    const end = ((before + s.amount) / total) * Math.PI * 2;
    return { ...s, d: arcPath(start, end) };
  });

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Persentase Biaya</h2>
          <p className="text-sm text-muted-foreground">Porsi total biaya project yang disetujui.</p>
        </div>
        <FilterPills
          label="Per"
          value={mode}
          onChange={setMode}
          options={[
            { value: "project", label: "Project" },
            { value: "customer", label: "Customer" },
          ]}
        />
      </div>

      {total === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Belum ada biaya yang disetujui.</p>
      ) : (
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
          <div className="relative shrink-0">
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Persentase biaya per ${mode === "project" ? "project" : "customer"}`}>
              {arcs.map((a) => (
                <path
                  key={a.key}
                  d={a.d}
                  fill={a.color}
                  // Celah 2px warna permukaan antar irisan.
                  stroke="var(--card)"
                  strokeWidth={2}
                  opacity={hover && hover !== a.key ? 0.35 : 1}
                  onMouseEnter={() => setHover(a.key)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-pointer transition-opacity"
                >
                  <title>{`${a.label}: ${formatRupiah(a.amount)} (${pctText(a.amount)})`}</title>
                </path>
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs text-muted-foreground">{active ? pctText(active.amount) : "Total"}</span>
              <span className="max-w-[100px] text-sm font-semibold tabular-nums">{formatRupiah(active ? active.amount : total)}</span>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="pb-2">{mode === "project" ? "Project" : "Customer"}</th>
                <th className="pb-2 text-right">Biaya</th>
                <th className="pb-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {slices.map((s) => (
                <tr
                  key={s.key}
                  onMouseEnter={() => setHover(s.key)}
                  onMouseLeave={() => setHover(null)}
                  className={`border-t border-border ${hover === s.key ? "bg-muted/60" : ""}`}
                >
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
                      {s.label}
                    </span>
                  </td>
                  <td className="py-2 text-right whitespace-nowrap tabular-nums">{formatRupiah(s.amount)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums">{pctText(s.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
