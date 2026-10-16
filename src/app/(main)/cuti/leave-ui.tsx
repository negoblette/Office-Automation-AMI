// Komponen server bersama halaman Cuti: tab & kartu saldo.
import { LinkTabs } from "@/components/shared/link-tabs";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Spotlight } from "@/components/shared/spotlight";
import { formatDate } from "@/lib/format";
import { riseStyle } from "@/lib/motion";
import type { LeaveBalanceView } from "@/lib/services/leave-queries";
import { cn } from "@/lib/utils";

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

/**
 * Saldo cuti versi seimbang (sorotan halaman Cuti, LV-07): satu ruas per hari saldo —
 * biru = sisa, kuning = menunggu approval, abu = terpakai. Angka dari saldo yang sama dengan kartu lama.
 */
export function LeaveBalanceSpotlight({ balance, title = "Saldo Cuti Saya" }: { balance: LeaveBalanceView; title?: string }) {
  const total = balance.entitlement + balance.carriedOver + balance.adjustment;
  // Hanya tampilan: sisa + menunggu + terpakai = total. Saldo minus → tanpa ruas biru.
  const slots = Math.max(0, total);
  const remainingSlots = Math.min(Math.max(0, balance.remaining), slots);
  const pendingSlots = Math.min(Math.max(0, balance.pending), slots - remainingSlots);
  const facts: { label: string; value: number | string; swatch?: string }[] = [
    { label: "Jatah", value: balance.entitlement },
    { label: "Carry over", value: balance.carriedOver },
    ...(balance.adjustment ? [{ label: "Penyesuaian", value: balance.adjustment > 0 ? `+${balance.adjustment}` : balance.adjustment }] : []),
    { label: "Terpakai", value: balance.used, swatch: "bg-rule" },
    { label: "Menunggu approval", value: balance.pending, swatch: "bg-amber" },
  ];

  return (
    <Spotlight label={title} style={riseStyle(3)} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-7 gap-y-2.5">
        <div className="min-w-0">
          <h2 className="text-[19px] leading-tight font-extrabold tracking-[-0.025em] text-ink">{title}</h2>
          <p className="mt-0.5 text-[13.5px] text-ink-3">
            Periode {date(balance.periodStart)} – {date(balance.periodEnd)} · sisa hangus 31 Des (maks 3 hari dibawa ke tahun berikutnya)
          </p>
          {balance.eligibleFrom !== balance.periodStart && (
            <p className="mt-1 text-[13px] font-semibold text-amber-ink">
              Cuti bisa dipakai mulai {date(balance.eligibleFrom ?? balance.firstEligibleDate)} (setelah genap 1 tahun masa kerja; tahun pertama 1 hari per bulan tersisa)
            </p>
          )}
        </div>
        <p className="flex flex-wrap items-baseline gap-x-2 text-[38px] leading-[1.08] font-extrabold tracking-[-0.04em] text-ink tabular-nums sm:text-[46px]">
          {balance.remaining}
          <span className="text-base font-semibold tracking-normal text-ink-3">/ {total} hari</span>
        </p>
      </div>
      <div
        role="img"
        aria-label={`${balance.remaining} hari tersisa, ${balance.pending} hari menunggu approval, ${balance.used} hari terpakai`}
        className="flex gap-1"
      >
        {slots === 0 ? (
          <span className="h-3.5 flex-1 rounded-[4px] bg-rule" />
        ) : (
          Array.from({ length: slots }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-3.5 min-w-[3px] flex-1 rounded-[4px]",
                index < remainingSlots ? "bg-brand" : index < remainingSlots + pendingSlots ? "bg-amber" : "bg-rule",
              )}
            />
          ))
        )}
      </div>
      <dl className="grid grid-cols-2 gap-y-3 md:grid-flow-col md:auto-cols-fr md:grid-cols-none">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="flex min-w-0 flex-col gap-px px-[18px] shadow-[-1px_0_0_var(--line)] first:pl-0 first:shadow-none max-md:odd:pl-0 max-md:odd:shadow-none"
          >
            <dt className="text-[13px] text-ink-3">
              {fact.swatch && <span aria-hidden className={cn("mr-[7px] inline-block size-2.5 rounded-[3px] align-[-1px]", fact.swatch)} />}
              {fact.label}
            </dt>
            <dd className="text-[15px] font-bold text-ink tabular-nums">{fact.value} hari</dd>
          </div>
        ))}
      </dl>
    </Spotlight>
  );
}

/** Saldo cuti (LV-07): jatah, carry over, terpakai, menunggu, sisa. Tampilan lama, dipakai Dashboard (dikunci). */
export function LeaveBalanceCard({ balance, title = "Saldo Cuti Saya" }: { balance: LeaveBalanceView; title?: string }) {
  const total = balance.entitlement + balance.carriedOver + balance.adjustment;
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
          <span className="ml-1 text-base font-medium text-muted-foreground">/ {total} hari</span>
        </p>
      </div>
      <ProgressBar className="mt-4" value={usedPercent} tone={balance.remaining <= 0 ? "danger" : "info"} />
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          ["Jatah", balance.entitlement],
          ["Carry over", balance.carriedOver],
          ...(balance.adjustment ? [["Penyesuaian", balance.adjustment > 0 ? `+${balance.adjustment}` : balance.adjustment] as const] : []),
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
