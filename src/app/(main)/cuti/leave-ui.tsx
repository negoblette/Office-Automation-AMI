// Komponen server bersama halaman Cuti: tab & kartu saldo.
import { LinkTabs } from "@/components/shared/link-tabs";
import { ProgressBar } from "@/components/shared/progress-bar";
import { formatDate } from "@/lib/format";
import type { LeaveBalanceView } from "@/lib/services/leave-queries";

export function CutiTabs({ active }: { active: "pengajuan" | "saldo" | "kalender" }) {
  return (
    <LinkTabs
      label="Cuti"
      active={active}
      tabs={[
        { key: "pengajuan", label: "Pengajuan", href: "/cuti" },
        { key: "saldo", label: "Saldo", href: "/cuti/saldo" },
        { key: "kalender", label: "Kalender Libur", href: "/cuti/kalender" },
      ]}
    />
  );
}

const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

/** Saldo cuti (LV-07): jatah, carry over, terpakai, menunggu, sisa. */
export function LeaveBalanceCard({ balance, title = "Saldo Cuti Saya" }: { balance: LeaveBalanceView; title?: string }) {
  const total = balance.entitlement + balance.carriedOver;
  const usedPercent = total ? ((balance.used + balance.pending) / total) * 100 : 0;
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">{title}</h2>
          <p className="text-xs text-muted-foreground">
            Periode {date(balance.periodStart)} – {date(balance.periodEnd)} · sisa hangus 31 Des (maks 3 hari dibawa ke tahun berikutnya)
          </p>
          {balance.eligibleFrom !== balance.periodStart && (
            <p className="mt-1 text-xs font-medium text-warning">
              Cuti bisa dipakai mulai {date(balance.eligibleFrom ?? balance.firstEligibleDate)} (setelah genap 1 tahun masa kerja; tahun pertama 1 hari per bulan tersisa)
            </p>
          )}
        </div>
        <p className="text-3xl font-bold tabular-nums">
          {balance.remaining}
          <span className="ml-1 text-base font-medium text-muted-foreground">/ {total} hari tersisa</span>
        </p>
      </div>
      <ProgressBar className="mt-4" value={usedPercent} tone={balance.remaining <= 0 ? "danger" : "info"} />
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          ["Jatah", balance.entitlement],
          ["Carry over", balance.carriedOver],
          ["Terpakai", balance.used],
          ["Menunggu approval", balance.pending],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums">{value} hari</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
