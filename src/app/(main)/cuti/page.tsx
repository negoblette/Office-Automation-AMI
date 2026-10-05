import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getCurrentBalances, listHolidays, listLeaveRequests } from "@/lib/services/leave-queries";
import { LeaveRequestDialog } from "./leave-form";
import { LeaveTable } from "./leave-table";
import { CutiTabs, LeaveBalanceCard } from "./leave-ui";

export const metadata: Metadata = { title: "Cuti" };

export default async function CutiPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const { bulan } = await searchParams;
  // Filter per bulan (Fase 14); kosong = semua.
  const yearMonth = bulan && /^\d{4}-(0[1-9]|1[0-2])$/.test(bulan) ? bulan : undefined;
  const [balance] = user.employeeId ? await getCurrentBalances(prisma, [user.employeeId]) : [];
  const [rows, holidays] = await Promise.all([listLeaveRequests(prisma, user, yearMonth), listHolidays(prisma)]);
  const monthLabel = yearMonth
    ? new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${yearMonth}-01T00:00:00Z`))
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cuti"
        description={isAdmin ? "Pengajuan cuti Anda dan seluruh karyawan." : "Ajukan cuti dan pantau saldo serta status pengajuan Anda."}
        breadcrumbs={[{ label: "Pengajuan & Keuangan" }, { label: "Cuti & Libur" }]}
        actions={
          balance && (
            <LeaveRequestDialog
              holidays={holidays.map((h) => h.date)}
              remaining={balance.remaining}
              eligibleFrom={balance.eligibleFrom ?? balance.firstEligibleDate}
            />
          )
        }
      />
      <CutiTabs active="pengajuan" />
      {balance ? <LeaveBalanceCard balance={balance} /> : <EmptyState title="Saldo cuti tidak tersedia" description="Akun Anda belum terhubung ke data karyawan." />}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Filter bulan
          <input type="month" name="bulan" defaultValue={yearMonth ?? ""} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
        </label>
        <button type="submit" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Tampilkan
        </button>
        {yearMonth && (
          <Link href="/cuti" className={buttonVariants({ variant: "ghost", size: "lg" })}>
            Semua bulan
          </Link>
        )}
        {monthLabel && (
          <p className="pb-2 text-sm text-muted-foreground">
            {rows.length} pengajuan cuti di {monthLabel} · {rows.filter((r) => r.status === "APPROVED").reduce((sum, r) => sum + r.workingDays, 0)} hari kerja disetujui
          </p>
        )}
      </form>
      <LeaveTable rows={rows} showRequester={isAdmin} />
    </div>
  );
}
