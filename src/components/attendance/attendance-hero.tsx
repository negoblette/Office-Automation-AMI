"use client";

import { Check, Loader2, LogIn, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clockInAction, clockOutAction } from "@/app/(main)/absensi/actions";
import { useJakartaClock } from "@/components/shared/use-jakarta-clock";
import { formatDuration } from "@/lib/attendance";
import { formatDate } from "@/lib/format";
import type { TodayAttendance } from "@/lib/services/attendance-queries";
import { cn } from "@/lib/utils";
import styles from "./attendance-hero.module.css";

type HeroState = "in" | "out" | "done";

const STATUS_LABEL: Record<HeroState, string> = {
  in: "Belum clock in",
  out: "Sedang bekerja",
  done: "Absen hari ini lengkap",
};

/**
 * Panel absensi biru (Dashboard; halaman Absensi menyusul). Perilakunya sama persis dengan `ClockCard`
 * (absensi/attendance-ui.tsx, masih dipakai di /absensi): aksi server yang sama, konfirmasi sebelum
 * clock out, refresh setelah berhasil, pesan error yang sama. Jam resmi dicatat server; jam berjalan
 * di sini hanya tampilan.
 */
export function AttendanceHero({ today, className, style }: { today: TodayAttendance | null; className?: string; style?: React.CSSProperties }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const clock = useJakartaClock();
  const state: HeroState | null = !today ? null : today.canClockIn ? "in" : today.canClockOut ? "out" : "done";

  // Animasi ganti tombol hanya saat keadaannya berubah setelah halaman terbuka (mis. selesai Clock In).
  const [shownState, setShownState] = useState(state);
  const [swaps, setSwaps] = useState(0);
  if (state !== shownState) {
    setShownState(state);
    setSwaps((count) => count + 1);
  }

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setError(result.error ?? "Gagal menyimpan absen");
    });
  };

  const notes = today
    ? [
        today.lateMinutes > 0 ? `terlambat ${formatDuration(today.lateMinutes)}` : null,
        today.earlyLeaveMinutes > 0 ? `pulang cepat ${formatDuration(today.earlyLeaveMinutes)}` : null,
      ].filter((note): note is string => note !== null)
    : [];

  return (
    <section aria-label="Absensi hari ini" className={cn(styles.heroShell, className)} style={style}>
      <div className={styles.hero}>
        <div className="flex flex-col gap-0.5">
          <p className="flex flex-wrap gap-x-2 text-sm font-medium text-on-hero-2">
            <span className="font-extrabold text-on-hero">Absensi</span>
            <span>{today ? formatDate(`${today.date}T00:00:00Z`, "weekday") : "—"}</span>
          </p>
          <p className="flex items-baseline gap-2.5">
            <span className="font-mono text-[clamp(38px,11vw,54px)] leading-[1.08] font-medium tracking-[-0.045em] tabular-nums">
              {clock ? clock.hm : "--:--"}
              <span className="text-on-hero-3">{clock ? clock.ss : ":--"}</span>
            </span>
            <span className="text-sm font-bold text-on-hero-2">WIB</span>
          </p>
        </div>

        {today?.clockIn && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
            <span className={styles.punch}>MASUK {today.clockIn}</span>
            {today.clockOut && <span className={cn(styles.punch, styles.punchOut)}>PULANG {today.clockOut}</span>}
          </div>
        )}

        <div className="flex w-full flex-wrap items-center justify-between gap-x-5 gap-y-3 sm:ml-auto sm:w-auto sm:justify-end">
          <p className="flex flex-col leading-snug sm:items-end sm:text-right">
            <span className="text-[15px] font-bold">{state ? STATUS_LABEL[state] : "Akun belum terhubung ke data karyawan."}</span>
            {today && (
              <span className="text-[13.5px] text-on-hero-2">
                Jam kerja {today.hours.workStart}–{today.hours.workEnd}
                {notes.length > 0 && <span className="font-semibold text-amber-soft"> · {notes.join(" · ")}</span>}
              </span>
            )}
          </p>

          {state === "in" || state === "out" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (state === "in") run(clockInAction);
                else if (window.confirm("Clock out sekarang? Jam pulang tidak bisa diubah lagi (kecuali dikoreksi Admin).")) run(clockOutAction);
              }}
              className={cn(styles.cta, state === "in" ? styles.ctaIn : styles.ctaOut, swaps > 0 && styles.swap)}
            >
              <span key={`label-${swaps}`} className={styles.ctaLabel}>
                {state === "in" ? "Clock In" : "Clock Out"}
              </span>
              <span key={`knob-${swaps}`} className={styles.knob} aria-hidden>
                {pending ? (
                  <Loader2 className="size-[18px] animate-spin" />
                ) : state === "in" ? (
                  <LogIn className="size-[18px]" />
                ) : (
                  <LogOut className="size-[18px]" />
                )}
              </span>
            </button>
          ) : state === "done" ? (
            <span className={cn(styles.cta, styles.ctaDone, swaps > 0 && styles.swap)}>
              <span key={`label-${swaps}`} className={styles.ctaLabel}>
                Selesai
              </span>
              <span key={`knob-${swaps}`} className={styles.knob} aria-hidden>
                <Check className="size-[18px]" />
              </span>
            </span>
          ) : null}
        </div>

        {error && (
          <p role="alert" className="w-full rounded-xl bg-white/15 px-3.5 py-2 text-sm font-semibold">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
