import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getWorkHours } from "@/lib/services/attendance";
import { WorkHoursDialog } from "./work-hours-dialog";

export const metadata: Metadata = { title: "Jam Kerja" };

export default async function SettingAbsensiPage() {
  await requireAdmin();
  const hours = await getWorkHours(prisma);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Jam Kerja & Absensi"
        description="Jam masuk & pulang untuk menandai terlambat dan pulang cepat. Sabtu, Minggu, dan hari libur tidak dihitung terlambat."
        breadcrumbs={[{ label: "Kontrol & Sistem" }, { label: "Setting", href: "/setting" }, { label: "Jam Kerja" }]}
      />
      <section className="flex max-w-xl flex-wrap items-center justify-between gap-4 rounded-2xl bg-card p-5 shadow-card sm:p-6">
        <dl className="grid grid-cols-2 gap-6">
          <div>
            <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Jam masuk</dt>
            <dd className="text-2xl font-bold tabular-nums">{hours.workStart}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Jam pulang</dt>
            <dd className="text-2xl font-bold tabular-nums">{hours.workEnd}</dd>
          </div>
        </dl>
        <WorkHoursDialog hours={hours} />
      </section>
      <p className="max-w-xl text-sm text-muted-foreground">
        Perubahan berlaku untuk absen berikutnya; status absen yang sudah tercatat tidak berubah (kecuali dikoreksi Admin).
      </p>
    </div>
  );
}
