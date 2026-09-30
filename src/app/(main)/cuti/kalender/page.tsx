import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDate, toJakartaIsoDate } from "@/lib/format";
import { listDirectorLeaves, listHolidays } from "@/lib/services/leave-queries";
import { CutiTabs } from "../leave-ui";
import { DeleteHolidayButton, HolidayForms } from "./holiday-manager";

export const metadata: Metadata = { title: "Kalender Libur" };

export default async function KalenderLiburPage({ searchParams }: { searchParams: Promise<{ tahun?: string }> }) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const currentYear = Number(toJakartaIsoDate().slice(0, 4));
  const requested = Number((await searchParams).tahun);
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : currentYear;
  const [holidays, directorLeaves] = await Promise.all([
    listHolidays(prisma, `${year}-01-01`, `${year}-12-31`),
    listDirectorLeaves(prisma, `${year}-01-01`, `${year}-12-31`),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kalender Libur & Direktur Cuti"
        description="Hari libur nasional & kantor (tidak dihitung sebagai hari cuti), serta jadwal cuti Direktur."
        breadcrumbs={[{ label: "Pengajuan & Keuangan" }, { label: "Cuti & Libur", href: "/cuti" }, { label: "Kalender Libur" }]}
      />
      <CutiTabs active="kalender" />

      {isAdmin && <HolidayForms />}

      <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
        <h2 className="mb-1 text-base font-semibold">Direktur Cuti {year}</h2>
        <p className="mb-4 text-sm text-muted-foreground">Cuti Direktur tidak memerlukan approval dan ditampilkan untuk semua karyawan.</p>
        {directorLeaves.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada cuti Direktur di {year}.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {directorLeaves.map((leave) => (
              <li key={leave.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning-soft px-4 py-3">
                <div>
                  <p className="font-semibold">Direktur cuti · {leave.employeeName}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(`${leave.startDate}T00:00:00Z`, "weekday")}
                    {leave.endDate !== leave.startDate && ` – ${formatDate(`${leave.endDate}T00:00:00Z`, "weekday")}`}
                  </p>
                </div>
                <StatusBadge variant="warning" dot={false}>
                  {leave.workingDays} hari kerja
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Libur {year}</h2>
          <nav aria-label="Pilih tahun" className="flex gap-1">
            {[year - 1, year + 1].map((y) => (
              <Link key={y} href={`/cuti/kalender?tahun=${y}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {y}
              </Link>
            ))}
          </nav>
        </div>
        {holidays.length === 0 ? (
          <EmptyState icon={CalendarDays} title={`Belum ada hari libur di ${year}`} description={isAdmin ? "Tambahkan atau impor daftar libur di atas." : undefined} className="shadow-none" />
        ) : (
          <ul className="divide-y divide-border">
            {holidays.map((holiday) => (
              <li key={holiday.id} className="flex items-center gap-4 py-3">
                <div className="w-14 shrink-0 rounded-lg bg-info-soft py-1.5 text-center">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                    {formatDate(`${holiday.date}T00:00:00Z`, "short").split(" ")[1]}
                  </p>
                  <p className="text-lg leading-none font-bold">{Number(holiday.date.slice(8))}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{holiday.name}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(`${holiday.date}T00:00:00Z`, "weekday")}</p>
                </div>
                <StatusBadge variant={holiday.isNational ? "info" : "neutral"} dot={false}>
                  {holiday.isNational ? "Nasional" : "Kantor"}
                </StatusBadge>
                {isAdmin && <DeleteHolidayButton id={holiday.id} name={holiday.name} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
