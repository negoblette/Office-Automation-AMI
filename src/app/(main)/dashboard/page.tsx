import { ClipboardCheck, HeartPulse, Plane, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LeaveBalanceCard } from "@/app/(main)/cuti/leave-ui";
import { HealthSummaryCard } from "@/app/(main)/kesehatan/health-ui";
import { LeaveCalendar } from "@/components/shared/leave-calendar";
import { ProgressBar } from "@/components/shared/progress-bar";
import { buttonVariants } from "@/components/ui/button";
import { APPROVAL_MODULE_META } from "@/lib/approval-modules";
import { type CurrentUser, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { toJakartaIsoDate } from "@/lib/format";
import { canApprove } from "@/lib/roles";
import { listMyApprovalQueue } from "@/lib/services/approval-queries";
import { getTodayAttendance } from "@/lib/services/attendance-queries";
import { getAdminDashboard, getStaffDashboard } from "@/lib/services/dashboard-queries";
import { getLeaveCalendar } from "@/lib/services/leave-queries";
import { cn } from "@/lib/utils";
import { AttendanceHero } from "./attendance-hero";
import styles from "./dashboard.module.css";
import { DashboardHeader } from "./dashboard-header";
import { IntroScope, PaperTray } from "./dashboard-motion";
import {
  DashboardCard,
  ExpiringCard,
  FolderPictogram,
  MyRequestsList,
  PeoplePictogram,
  QueueSection,
  StaffReminderCard,
  StatItem,
  StatsBand,
  riseStyle,
} from "./dashboard-ui";

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
    <IntroScope className="relative flex flex-col gap-7">
      <DashboardHeader
        title="Dashboard Operasional & Approval"
        description={`Ringkasan data kantor, antrian persetujuan Anda, serta sertifikat${data.assets ? " & unit" : ""} yang akan berakhir.`}
        breadcrumbs={[{ label: "Utama" }, { label: "Dashboard" }]}
      />

      <AttendanceHero today={today} className={styles.rise} style={riseStyle(3)} />

      <StatsBand>
        <StatItem
          label="Karyawan aktif"
          value={data.employees.active}
          order={0}
          pictogram={<PeoplePictogram />}
          warn={data.employees.incompleteDocuments > 0}
          footer={
            <Link href="/karyawan" className="hover:underline">
              {data.employees.joinedThisMonth > 0 && `+${data.employees.joinedThisMonth} bergabung bulan ini · `}
              {data.employees.incompleteDocuments} dokumen belum lengkap
            </Link>
          }
        />
        <StatItem
          label="Antrian approval Anda"
          value={data.queue.length}
          order={1}
          pictogram={<PaperTray count={data.queue.length} />}
          footer={
            perModule.size ? (
              <span className="flex flex-wrap gap-1">
                {[...perModule].map(([label, count]) => (
                  <span key={label} className="rounded-md bg-white px-1.5 py-0.5 shadow-[inset_0_0_0_1px_var(--line)]">
                    {count} {label}
                  </span>
                ))}
              </span>
            ) : (
              `${data.pendingAll} pengajuan menunggu di semua approver`
            )
          }
        />
        <StatItem
          label="Project aktif"
          value={data.activeProjects}
          order={2}
          pictogram={<FolderPictogram />}
          footer={
            <Link href="/project" className="hover:underline">
              Lihat project & customer
            </Link>
          }
        />
        {data.assets && (
          <StatItem
            label="Unit dipinjam"
            value={data.assets.assigned}
            unit={`/ ${data.assets.total} unit`}
            order={3}
            footer={<ProgressBar value={data.assets.total ? (data.assets.assigned / data.assets.total) * 100 : 0} label="Unit dipinjam" />}
          />
        )}
      </StatsBand>

      <QueueSection title="Antrian Persetujuan Butuh Tindakan" description="Pengajuan yang menunggu persetujuan Anda" rows={data.queue} />

      <div className={cn(styles.panelCards, styles.calendarCard, styles.rise)} style={riseStyle(11)}>
        {calendar}
      </div>
      <div className={styles.rise} style={riseStyle(12)}>
        <ExpiringCard items={data.expiring} includeAssets={data.assets !== null} />
      </div>
    </IntroScope>
  );
}

/** Tombol aksi di kepala Dashboard Staf (link sama, tampilan pil). */
const softAction = cn(
  buttonVariants({ variant: "outline", size: "lg" }),
  "h-11 gap-2 rounded-full border-transparent bg-brand-soft px-4 font-bold text-brand-deep hover:bg-brand-tint hover:text-brand-deep",
);
const primaryAction = cn(
  buttonVariants({ size: "lg" }),
  "h-11 gap-2 rounded-full bg-brand px-4 font-bold text-white shadow-(--elev-cta) hover:bg-brand hover:brightness-[1.07]",
);

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
    <IntroScope className="relative flex flex-col gap-7">
      <DashboardHeader
        title={`Halo, ${user.name}`}
        description="Status pengajuan, saldo cuti, sisa plafon kesehatan, dan hal yang perlu Anda lengkapi."
        breadcrumbs={[{ label: "Utama" }, { label: "Dashboard" }]}
        actions={
          <>
            <Link href="/reimburse/baru" className={softAction}>
              <Receipt aria-hidden /> Reimburse
            </Link>
            <Link href="/cuti" className={softAction}>
              <Plane aria-hidden /> Cuti
            </Link>
            <Link href="/kesehatan" className={primaryAction}>
              <HeartPulse aria-hidden /> Klaim Kesehatan
            </Link>
          </>
        }
      />

      <AttendanceHero today={today} className={styles.rise} style={riseStyle(3)} />

      {data.queue && (
        <QueueSection title="Antrian Persetujuan Anda" description="Pengajuan yang menunggu persetujuan Anda sebagai Approver" rows={data.queue} />
      )}

      <div className={cn("grid gap-6 lg:grid-cols-2", styles.panelCards, styles.rise)} style={riseStyle(5)}>
        {data.balance && <LeaveBalanceCard balance={data.balance} />}
        {data.health && <HealthSummaryCard summary={data.health} />}
      </div>

      <DashboardCard title="Status Pengajuan Saya" description="8 pengajuan terakhir" icon={ClipboardCheck} className={styles.rise} style={riseStyle(8)}>
        <MyRequestsList rows={data.requests} />
      </DashboardCard>

      <div className={cn(styles.panelCards, styles.calendarCard, styles.rise)} style={riseStyle(11)}>
        {calendar}
      </div>
      <div className={styles.rise} style={riseStyle(12)}>
        <StaffReminderCard documentMissing={data.documentMissing} certificates={data.certificates} />
      </div>
    </IntroScope>
  );
}
