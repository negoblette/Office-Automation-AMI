import { ArrowRight, KeyRound } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { RECOVERY_TEST_INTERVAL_DAYS, getRecoveryOverview, isRecoveryKeyHolder, recoveryReminder } from "@/lib/services/recovery-key";
import { cn } from "@/lib/utils";

/**
 * Pengingat untuk pemegang kunci (env RECOVERY_KEY_HOLDERS): kunci pemulihan belum dibuat, atau > 3 bulan belum diuji.
 *
 * Tata letak mobile-first (2026-10-27): dulu ikon, teks, dan tombol dipaksa satu baris sehingga di HP teks menyempit
 * jadi satu kata per baris. Sekarang:
 * - HP: [ikon | judul] → penjelasan selebar kartu → tombol selebar kartu (44 px).
 * - ≥ 640 px: [ikon | judul + penjelasan | tombol] dalam satu baris, penjelasan dibatasi ±65 karakter.
 */
export async function RecoveryKeyReminder({ email }: { email: string }) {
  if (!isRecoveryKeyHolder(email)) return null;
  const overview = await getRecoveryOverview(prisma);
  const reminder = recoveryReminder(overview.holders.find((holder) => holder.email === email.toLowerCase()));
  if (!reminder) return null;
  const missing = reminder === "MISSING";
  return (
    // `relative`: tampil di atas hiasan jam kepala dashboard (posisi absolute) yang bisa menimpa banner ini.
    // Wilayah berlabel, bukan role=alert: pengingat tetap, bukan kejadian mendadak yang perlu menyela pembaca layar.
    <section
      aria-labelledby="recovery-key-reminder-title"
      className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 rounded-[22px] border-2 border-warning/40 bg-warning-soft p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-4 sm:gap-y-1 sm:p-5"
    >
      {/* ≥ 640 px: posisi tiap sel ditulis eksplisit; tanpa itu grid menaruh penjelasan di baris 1 dan judul tergeser. */}
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-warning sm:col-start-1 sm:row-span-2 sm:row-start-1"
        aria-hidden
      >
        <KeyRound className="size-5" />
      </span>
      <h2 id="recovery-key-reminder-title" className="text-base leading-snug font-bold text-balance text-ink sm:col-start-2 sm:row-start-1 sm:self-end">
        {missing ? "Kunci pemulihan Anda belum dibuat" : "Saatnya menguji kata sandi pemulihan"}
      </h2>
      <p className="col-span-2 max-w-[65ch] text-sm leading-relaxed text-ink-3 sm:col-span-1 sm:col-start-2 sm:row-start-2 sm:self-start">
        {missing
          ? "Anda pemegang kunci darurat backup. Buat kata sandi pemulihan supaya data karyawan bisa dipulihkan bila server rusak."
          : `Sudah lebih dari ${RECOVERY_TEST_INTERVAL_DAYS / 30} bulan sejak kata sandi pemulihan terakhir diuji. Pastikan Anda masih mengingatnya.`}
      </p>
      <Link
        href="/setting/kunci-pemulihan"
        className={cn(
          buttonVariants({ variant: "secondary" }),
          "col-span-2 w-full bg-white/80 hover:bg-white sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:w-auto",
        )}
      >
        {/* Teks ini dikutip di docs/07-DEPLOYMENT.md §6.5 (panduan pemegang kunci) — ubah keduanya bersamaan. */}
        Buka Kunci Pemulihan
        <ArrowRight aria-hidden />
      </Link>
    </section>
  );
}
