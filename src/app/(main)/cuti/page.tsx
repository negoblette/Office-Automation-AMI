import type { Metadata } from "next";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getCurrentBalances, listHolidays, listLeaveRequests } from "@/lib/services/leave-queries";
import { LeaveRequestDialog } from "./leave-form";
import { LeaveTable } from "./leave-table";
import { CutiTabs, LeaveBalanceCard } from "./leave-ui";

export const metadata: Metadata = { title: "Cuti" };

export default async function CutiPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const [balance] = user.employeeId ? await getCurrentBalances(prisma, [user.employeeId]) : [];
  const [rows, holidays] = await Promise.all([listLeaveRequests(prisma, user), listHolidays(prisma)]);

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
      <LeaveTable rows={rows} showRequester={isAdmin} />
    </div>
  );
}
