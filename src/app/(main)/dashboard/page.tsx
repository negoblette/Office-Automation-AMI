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
import { canApprove } from "@/lib/roles";
import { listMyApprovalQueue } from "@/lib/services/approval-queries";
import { getTodayAttendance } from "@/lib/services/attendance-queries";
import { getAdminDashboard, getStaffDashboard } from "@/lib/services/dashboard-queries";
import { LeaveCalendar } from "@/components/shared/leave-calendar";
import { toJakartaIsoDate } from "@/lib/format";
import { getLeaveCalendar } from "@/lib/services/leave-queries";
import { DashboardCard, ExpiringCard, MyRequestsList, StaffReminderCard } from "./dashboard-ui";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ kal?: string }> }) {
  const user = await requireUser();
  const { kal } = await searchParams;
  const todayIso = toJakartaIsoDate();
  const yearMonth = kal && /^\d{4}-(0[1-9]|1[0-2])$/.test(kal) ? kal : todayIso.slice(0, 7);
  // Kalender cuti bulanan (Fase 14): semua karyawan melihat cuti semua karyawan.
  const calendar = <LeaveCalendar weeks={await getLeaveCalendar(prisma, yearMonth)} yearMonth={yearMonth} todayIso={todayIso} hrefFor={(ym) => `/dashboard?kal=${ym}`} />;
  return user.role === "ADMIN" ? <AdminDashboard user={user} calendar={calendar} /> : <StaffDashboard user={user} calendar={calendar} />;
}

async function AdminDashboard({ user, calendar }: { user: CurrentUser; calendar: React.ReactNode }) {
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

      {calendar}
      <ExpiringCard items={data.expiring} includeAssets={data.assets !== null} />
    </div>
  );
}

async function StaffDashboard({ user, calendar }: { user: CurrentUser; calendar: React.ReactNode }) {
  const [data, today] = await Promise.all([
    getStaffDashboard(prisma, user).then(async (staff) => ({
      ...staff,
      // Role APPROVER: dashboard Staf + antrian approval miliknya.
      queue: canApprove(user.role) ? await listMyApprovalQueue(prisma, user.id) : null,
    })),
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

      {data.queue && (
        <DashboardCard
          title="Antrian Persetujuan Anda"
          description="Pengajuan yang menunggu persetujuan Anda sebagai Approver"
          icon={ClipboardCheck}
          action={
            <Link href="/approval" className="text-sm font-medium text-primary hover:underline">
              Buka Approval Center
            </Link>
          }
        >
          <ApprovalQueueTable rows={data.queue} />
        </DashboardCard>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {data.balance && <LeaveBalanceCard balance={data.balance} />}
        {data.health && <HealthSummaryCard summary={data.health} />}
      </div>

      <DashboardCard title="Status Pengajuan Saya" description="8 pengajuan terakhir" icon={ClipboardCheck}>
        <MyRequestsList rows={data.requests} />
      </DashboardCard>

      {calendar}
      <StaffReminderCard documentMissing={data.documentMissing} certificates={data.certificates} />
    </div>
  );
}
