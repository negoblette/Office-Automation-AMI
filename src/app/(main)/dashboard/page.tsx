import { Briefcase, ClipboardCheck, HeartPulse, Inbox, MonitorSmartphone, Plane, Receipt, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ClockCard } from "@/app/(main)/absensi/attendance-ui";
import { ApprovalQueueTable } from "@/app/(main)/approval/approval-tables";
import { LeaveBalanceCard } from "@/app/(main)/cuti/leave-ui";
import { HealthSummaryCard } from "@/app/(main)/kesehatan/health-ui";
import { PageHeader } from "@/components/shared/page-header";
import { ProgressBar } from "@/components/shared/progress-bar";
import { StatCard } from "@/components/shared/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { APPROVAL_MODULE_META } from "@/lib/approval-modules";
import { type CurrentUser, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getTodayAttendance } from "@/lib/services/attendance-queries";
import { getAdminDashboard, getStaffDashboard } from "@/lib/services/dashboard-queries";
import { DashboardCard, ExpiringCard, MyRequestsList, StaffReminderCard, WeekCard } from "./dashboard-ui";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  return user.role === "ADMIN" ? <AdminDashboard user={user} /> : <StaffDashboard user={user} />;
}

async function AdminDashboard({ user }: { user: CurrentUser }) {
  const [data, today] = await Promise.all([
    getAdminDashboard(prisma, user.id),
    user.employeeId ? getTodayAttendance(prisma, user.employeeId) : null,
  ]);
  const perModule = new Map<string, number>();
  for (const row of data.queue) {
    const label = APPROVAL_MODULE_META[row.module].label;
    perModule.set(label, (perModule.get(label) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard Operasional & Approval"
        description={`Ringkasan data kantor, antrian persetujuan Anda, serta sertifikat${data.assets ? " & unit" : ""} yang akan berakhir.`}
        breadcrumbs={[{ label: "Utama" }, { label: "Dashboard" }]}
      />

      <ClockCard today={today} />

      <div className={data.assets ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" : "grid gap-4 sm:grid-cols-3"}>
        <StatCard
          label="Karyawan aktif"
          value={data.employees.active}
          icon={Users}
          footer={
            <Link href="/karyawan" className="hover:underline">
              {data.employees.joinedThisMonth > 0 && `+${data.employees.joinedThisMonth} bergabung bulan ini · `}
              {data.employees.incompleteDocuments} dokumen belum lengkap
            </Link>
          }
        />
        <StatCard
          label="Antrian approval Anda"
          value={data.queue.length}
          icon={Inbox}
          tone={data.queue.length ? "danger" : "success"}
          footer={
            perModule.size ? (
              <span className="flex flex-wrap gap-1">
                {[...perModule].map(([label, count]) => (
                  <span key={label} className="rounded-md bg-muted px-1.5 py-0.5">
                    {count} {label}
                  </span>
                ))}
              </span>
            ) : (
              `${data.pendingAll} pengajuan menunggu di semua approver`
            )
          }
        />
        <StatCard
          label="Project aktif"
          value={data.activeProjects}
          icon={Briefcase}
          tone="neutral"
          footer={
            <Link href="/project" className="hover:underline">
              Lihat project & customer
            </Link>
          }
        />
        {data.assets && (
          <StatCard
            label="Unit dipinjam"
            value={data.assets.assigned}
            unit={`/ ${data.assets.total} unit`}
            icon={MonitorSmartphone}
            tone="warning"
            footer={<ProgressBar value={data.assets.total ? (data.assets.assigned / data.assets.total) * 100 : 0} label="Unit dipinjam" />}
          />
        )}
      </div>

      <DashboardCard
        title="Antrian Persetujuan Butuh Tindakan"
        description="Pengajuan yang menunggu persetujuan Anda"
        icon={ClipboardCheck}
        action={
          <Link href="/approval" className="text-sm font-medium text-primary hover:underline">
            Buka Approval Center
          </Link>
        }
      >
        <ApprovalQueueTable rows={data.queue} />
      </DashboardCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <WeekCard week={data.week} />
        <ExpiringCard items={data.expiring} includeAssets={data.assets !== null} />
      </div>
    </div>
  );
}

async function StaffDashboard({ user }: { user: CurrentUser }) {
  const [data, today] = await Promise.all([
    getStaffDashboard(prisma, user),
    user.employeeId ? getTodayAttendance(prisma, user.employeeId) : null,
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Halo, ${user.name}`}
        description="Status pengajuan, saldo cuti, sisa plafon kesehatan, dan hal yang perlu Anda lengkapi."
        breadcrumbs={[{ label: "Utama" }, { label: "Dashboard" }]}
        actions={
          <>
            <Link href="/reimburse/baru" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Receipt aria-hidden /> Reimburse
            </Link>
            <Link href="/cuti" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Plane aria-hidden /> Cuti
            </Link>
            <Link href="/kesehatan" className={buttonVariants({ size: "lg" })}>
              <HeartPulse aria-hidden /> Klaim Kesehatan
            </Link>
          </>
        }
      />

      <ClockCard today={today} />

      <div className="grid gap-6 lg:grid-cols-2">
        {data.balance && <LeaveBalanceCard balance={data.balance} />}
        {data.health && <HealthSummaryCard summary={data.health} />}
      </div>

      <DashboardCard title="Status Pengajuan Saya" description="8 pengajuan terakhir" icon={ClipboardCheck}>
        <MyRequestsList rows={data.requests} />
      </DashboardCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <StaffReminderCard documentMissing={data.documentMissing} certificates={data.certificates} />
        <WeekCard week={data.week} />
      </div>
    </div>
  );
}
