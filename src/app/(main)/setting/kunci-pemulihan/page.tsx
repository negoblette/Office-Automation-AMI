import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { type RecoveryHolderStatus, RECOVERY_TEST_INTERVAL_DAYS, getRecoveryOverview, isRecoveryKeyHolder, recoveryReminder } from "@/lib/services/recovery-key";
import { RecoveryKeyForm, RecoveryTestForm } from "./recovery-key-forms";

export const metadata: Metadata = { title: "Kunci Pemulihan" };

function HolderStatus({ status }: { status: RecoveryHolderStatus }) {
  if (!status.key) return <StatusBadge variant="warning">Belum dibuat</StatusBadge>;
  if (status.key.fileMissing) return <StatusBadge variant="danger">File hilang — buat ulang</StatusBadge>;
  return <StatusBadge variant="success">Aktif</StatusBadge>;
}

/**
 * Kunci pemulihan (docs/08-INVENTARIS-DATA.md §4–5) — hanya untuk pemegang kunci (env RECOVERY_KEY_HOLDERS).
 * Pemegang kunci membuat kata sandi pemulihan di sini, tanpa perintah teknis; petugas IT memakainya saat memulihkan server.
 */
export default async function RecoveryKeyPage() {
  const user = await requireAdmin();
  if (!isRecoveryKeyHolder(user.email)) redirect("/akses-ditolak");
  const overview = await getRecoveryOverview(prisma);
  const mine = overview.holders.find((holder) => holder.email === user.email.toLowerCase());
  const hasKey = Boolean(mine?.key && !mine.key.fileMissing);
  const testDue = recoveryReminder(mine) === "TEST_DUE";
  const backupReady = overview.readyCount >= overview.minHolders;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kunci Pemulihan"
        description="Kata sandi darurat untuk membuka backup bila server kantor rusak."
        breadcrumbs={[{ label: "Kontrol & Sistem" }, { label: "Setting", href: "/setting" }, { label: "Kunci Pemulihan" }]}
      />

      <section className="max-w-3xl rounded-2xl bg-card p-5 shadow-card sm:p-6">
        <h2 className="mb-2 text-base font-semibold">Apa ini?</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground">
          <li>Data pribadi karyawan dikunci dengan kunci data yang tersimpan di server. Bila server rusak total, kunci itu ikut hilang.</li>
          <li>
            Kata sandi pemulihan Anda membuka <strong>salinan cadangan</strong> kunci data dan backup. Kata sandi ini <strong>hanya dibutuhkan saat darurat</strong>{" "}
            — sehari-hari, termasuk setelah mati listrik, aplikasi tetap berjalan sendiri.
          </li>
          <li>Saat pemulihan, petugas IT menjalankan semua langkah teknis; Anda cukup hadir dan mengetik kata sandi pemulihan saat diminta.</li>
          <li>
            Kata sandi ini <strong>tidak disimpan di mana pun</strong> dan tidak bisa di-reset. Bila semua pemegang kunci lupa, data pribadi karyawan tidak
            bisa dipulihkan — karena itu ada lebih dari satu pemegang kunci, dan kata sandi perlu diuji setiap {RECOVERY_TEST_INTERVAL_DAYS / 30} bulan.
          </li>
        </ul>
      </section>

      <section className="max-w-3xl overflow-x-auto rounded-2xl bg-card shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 sm:px-6">
          <h2 className="text-base font-semibold">Pemegang kunci</h2>
          <StatusBadge variant={backupReady ? "success" : "warning"}>
            {backupReady ? "Backup berjalan" : `Backup menunggu ${overview.minHolders} pemegang kunci (${overview.readyCount} dari ${overview.minHolders})`}
          </StatusBadge>
        </div>
        <table className="mt-3 w-full min-w-[520px] text-sm">
          <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="px-5 py-3 sm:px-6">Nama</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Dibuat</th>
              <th className="px-4 py-3">Terakhir diuji</th>
            </tr>
          </thead>
          <tbody>
            {overview.holders.map((holder) => (
              <tr key={holder.email} className="border-t border-border">
                <td className="px-5 py-3 sm:px-6">
                  <p className="font-medium">{holder.name}</p>
                  <p className="text-xs text-muted-foreground">{holder.email}</p>
                </td>
                <td className="px-4 py-3">
                  <HolderStatus status={holder} />
                </td>
                <td className="px-4 py-3">{holder.key ? formatDate(holder.key.createdAt) : "—"}</td>
                <td className="px-4 py-3">{holder.key?.verifiedAt ? formatDate(holder.key.verifiedAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        {hasKey && (
          <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
            <h2 className="mb-1 text-base font-semibold">Uji kata sandi pemulihan</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {testDue
                ? `Sudah lebih dari ${RECOVERY_TEST_INTERVAL_DAYS / 30} bulan sejak kata sandi ini terakhir diuji. Pastikan Anda masih mengingatnya.`
                : "Pastikan Anda masih mengingat kata sandi pemulihan. Tidak ada yang diubah."}
            </p>
            <RecoveryTestForm />
          </section>
        )}
        <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
          <h2 className="mb-1 text-base font-semibold">{hasKey ? "Ganti kata sandi pemulihan" : "Buat kata sandi pemulihan"}</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {hasKey
              ? "Pakai bila Anda lupa atau curiga kata sandi diketahui orang lain. Backup berikutnya memakai kata sandi baru; backup lama tetap terbuka dengan kata sandi lama."
              : "Buat sekali saja. Simpan di ingatan atau pengelola password pribadi, jangan di kertas yang mudah ditemukan orang."}
          </p>
          <RecoveryKeyForm hasKey={hasKey} />
        </section>
      </div>
    </div>
  );
}
