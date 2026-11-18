"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useFeedback } from "@/components/shared/feedback";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import type { HolidayChangeKind } from "@/generated/prisma/enums";
import { formatDate, formatDateTime } from "@/lib/format";
import type { HolidayChangeView, HolidayRunView, HolidaySyncResult } from "@/lib/services/holiday-sync";
import { syncHolidaysNowAction } from "../actions";

const day = (iso: string) => formatDate(`${iso}T00:00:00Z`, "weekday");
const shortDay = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

const KIND: Record<HolidayChangeKind, { label: string; variant: "success" | "danger" | "info" }> = {
  ADD: { label: "Ditambahkan", variant: "success" },
  REMOVE: { label: "Dihapus", variant: "danger" },
  RENAME: { label: "Nama diperbarui", variant: "info" },
};

function ChangeLine({ change }: { change: HolidayChangeView }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusBadge variant={KIND[change.kind].variant} dot={false}>
        {KIND[change.kind].label}
      </StatusBadge>
      <span className="font-medium">{day(change.date)}</span>
      <span className="wrap-anywhere text-muted-foreground">
        {change.kind === "RENAME" ? `"${change.previousName ?? ""}" → "${change.name}"` : change.name}
      </span>
    </span>
  );
}

/**
 * Admin: sinkronisasi libur nasional dari kalender Google (2026-11-18) — status terakhir, perubahan yang menunggu
 * konfirmasi, perubahan 30 hari terakhir beserta pengajuan cuti terdampak, dan tombol jalankan sekarang.
 */
export function HolidaySyncCard({ status, runs }: { status: HolidaySyncResult | null; runs: HolidayRunView[] }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [pending, startTransition] = useTransition();

  const runNow = () =>
    startTransition(async () => {
      const result = await syncHolidaysNowAction();
      if (!result.ok) {
        notify(result.error, "danger");
        return;
      }
      notify("Sinkronisasi dijalankan — hasilnya muncul dalam beberapa detik");
      setTimeout(() => router.refresh(), 6000);
    });

  return (
    <section id="perubahan-libur" aria-labelledby="holiday-sync-title" className="flex scroll-mt-24 flex-col gap-4 rounded-2xl bg-card p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl min-w-0">
          <h2 id="holiday-sync-title" className="text-base font-semibold">
            Libur nasional otomatis
          </h2>
          <p className="text-sm text-muted-foreground">
            Diambil dari kalender libur nasional Google setiap hari jam 06.00 WIB, untuk sisa tahun ini dan tahun depan. Perubahan (libur dipindah,
            ditambah, atau dihapus) diterapkan setelah dicek ulang keesokan harinya. Libur yang diisi atau diimpor manual tidak pernah diubah.
          </p>
        </div>
        <Button variant="outline" disabled={pending} onClick={runNow}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Sinkronkan sekarang
        </Button>
      </div>

      {status ? (
        <div role="status" className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            Terakhir: {formatDateTime(status.at)} ·{" "}
            {status.years.map((y) => `${y.year}: ${y.available ? `${y.holidays} libur nasional` : "belum tersedia"}`).join(" · ")}
          </p>
          {status.error && <p className="rounded-xl bg-red-soft px-4 py-3 font-medium text-red-deep">{status.error}</p>}
          {status.blocked && (
            <p className="rounded-xl bg-red-soft px-4 py-3 font-medium text-red-deep">
              Ditahan: terlalu banyak perubahan sekaligus — kemungkinan sumber sedang salah. Periksa daftar di bawah; bila memang benar, ubah libur
              secara manual.
            </p>
          )}
          {status.pending.length > 0 && (
            <div className="rounded-xl bg-amber-soft px-4 py-3 text-amber-deep">
              <p className="font-semibold">Menunggu konfirmasi ({status.pending.length})</p>
              <p className="mb-2 text-xs">Diterapkan pada cek berikutnya bila sumber masih sama; batal bila berubah lagi.</p>
              <ul className="flex flex-col gap-1.5">
                {status.pending.map((change) => (
                  <li key={`${change.kind}-${change.date}`}>
                    <ChangeLine change={change} />
                    <span className="block text-xs">Paling cepat {formatDateTime(change.applyAfter)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {status.unmanaged.length > 0 && (
            <div className="rounded-xl bg-panel px-4 py-3">
              <p className="font-semibold">Libur nasional isian manual yang tidak ada di kalender Google</p>
              <p className="mb-1 text-xs text-muted-foreground">Tidak diubah otomatis — periksa, lalu hapus manual bila memang dipindah / dibatalkan.</p>
              <ul className="flex flex-col gap-1">
                {status.unmanaged.map((holiday) => (
                  <li key={holiday.date}>
                    <span className="font-medium">{day(holiday.date)}</span> — <span className="wrap-anywhere">{holiday.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Belum pernah disinkronkan.</p>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Perubahan 30 hari terakhir</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada perubahan.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {runs.map((run) => {
              const affected = run.changes.flatMap((change) => change.affected.map((leave) => ({ change, leave })));
              return (
                <li key={run.runId} className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">{formatDateTime(run.appliedAt)}</p>
                  <ul className="flex flex-col gap-1.5">
                    {run.changes.map((change) => (
                      <li key={`${change.kind}-${change.date}`}>
                        <ChangeLine change={change} />
                      </li>
                    ))}
                  </ul>
                  {affected.length > 0 && (
                    <div className="rounded-lg bg-amber-soft px-3 py-2 text-amber-deep">
                      <p className="font-semibold">{affected.length} pengajuan cuti terdampak — cek saldonya (tidak dikoreksi otomatis)</p>
                      <ul className="mt-1 flex flex-col gap-1">
                        {affected.map(({ change, leave }) => (
                          <li key={`${change.date}-${leave.id}`} className="wrap-anywhere">
                            <span className="font-mono text-xs">{leave.number}</span> · {leave.employeeName} · {shortDay(leave.startDate)}
                            {leave.endDate !== leave.startDate && ` – ${shortDay(leave.endDate)}`} — {shortDay(change.date)}: {leave.effect}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
