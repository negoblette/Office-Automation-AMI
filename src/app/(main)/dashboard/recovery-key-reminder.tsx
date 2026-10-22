import { KeyRound } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { RECOVERY_TEST_INTERVAL_DAYS, getRecoveryOverview, isRecoveryKeyHolder, recoveryReminder } from "@/lib/services/recovery-key";

/** Pengingat untuk pemegang kunci (env RECOVERY_KEY_HOLDERS): kunci pemulihan belum dibuat, atau > 3 bulan belum diuji. */
export async function RecoveryKeyReminder({ email }: { email: string }) {
  if (!isRecoveryKeyHolder(email)) return null;
  const overview = await getRecoveryOverview(prisma);
  const reminder = recoveryReminder(overview.holders.find((holder) => holder.email === email.toLowerCase()));
  if (!reminder) return null;
  return (
    // `relative`: tampil di atas hiasan jam kepala dashboard (posisi absolute) yang bisa menimpa banner ini.
    <section role="alert" className="relative flex flex-wrap items-center gap-3 rounded-[22px] border-2 border-warning/40 bg-warning-soft p-4 sm:p-5">
      <KeyRound className="size-5 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold text-ink">
          {reminder === "MISSING" ? "Kunci pemulihan Anda belum dibuat" : "Saatnya menguji kata sandi pemulihan"}
        </h2>
        <p className="text-sm text-ink-3">
          {reminder === "MISSING"
            ? "Anda pemegang kunci darurat backup. Buat kata sandi pemulihan supaya data karyawan bisa dipulihkan bila server rusak."
            : `Sudah lebih dari ${RECOVERY_TEST_INTERVAL_DAYS / 30} bulan sejak kata sandi pemulihan terakhir diuji. Pastikan Anda masih mengingatnya.`}
        </p>
      </div>
      <Link href="/setting/kunci-pemulihan" className={buttonVariants({ variant: "secondary" })}>
        Buka Kunci Pemulihan
      </Link>
    </section>
  );
}
