import { LinkTabs } from "@/components/shared/link-tabs";
import { ProgressBar } from "@/components/shared/progress-bar";
import { formatRupiah } from "@/lib/format";
import type { HealthSummary } from "@/lib/services/health-queries";

export function KesehatanTabs({ active, isAdmin }: { active: "klaim" | "pembayaran"; isAdmin: boolean }) {
  if (!isAdmin) return null;
  return (
    <LinkTabs
      label="Kesehatan"
      active={active}
      tabs={[
        { key: "klaim", label: "Klaim", href: "/kesehatan" },
        { key: "pembayaran", label: "Jadwal Pembayaran", href: "/kesehatan/pembayaran" },
      ]}
    />
  );
}

/** Plafon kesehatan tahun berjalan (HC-01, HC-05, HC-07). */
export function HealthSummaryCard({ summary }: { summary: HealthSummary }) {
  if (summary.annual === null) {
    return (
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Plafon Kesehatan {summary.year}</h2>
        <p className="mt-2 text-sm text-muted-foreground">Plafon Anda untuk tahun {summary.year} belum diatur. Hubungi Admin sebelum mengajukan klaim.</p>
      </section>
    );
  }
  const usedPercent = ((summary.approved + summary.pending) / summary.annual) * 100;
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Plafon Kesehatan {summary.year}</h2>
          <p className="text-xs text-muted-foreground">Tidak ada carry over ke tahun berikutnya.</p>
        </div>
        <p className="text-2xl font-bold tabular-nums">
          {formatRupiah(summary.remaining)}
          <span className="ml-1 text-sm font-medium text-muted-foreground">tersisa dari {formatRupiah(summary.annual)}</span>
        </p>
      </div>
      <ProgressBar className="mt-4" value={usedPercent} tone={summary.remaining <= 0 ? "danger" : "success"} />
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          ["Disetujui", summary.approved],
          ["Menunggu approval", summary.pending],
          ["Terpakai + menunggu", summary.approved + summary.pending],
          ["Dijadwalkan dibayar bulan ini", summary.scheduledThisMonth],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums">{formatRupiah(Number(value))}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
