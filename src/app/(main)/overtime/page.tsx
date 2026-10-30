import { Clock, ReceiptText, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { STAT_GRID, StatCard } from "@/components/shared/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { formatDuration } from "@/lib/attendance";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { toJakartaIsoDate } from "@/lib/format";
import { canUseOvertime } from "@/lib/services/overtime";
import { getOpenOvertime, getOvertimeFinishOptions, listOvertimes, type OvertimeRow } from "@/lib/services/overtime-queries";
import { MonthNav } from "../absensi/attendance-ui";
import { OvertimeClockCard, OvertimeTable } from "./overtime-ui";

export const metadata: Metadata = { title: "Overtime" };

const validMonth = (value: string | undefined, max: string) => (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value <= max ? value : max);

/**
 * Overtime engineer (2026-10-30): karyawan divisi Engineer mencatat sesi lembur → approval Ko Yosep → Reimburse
 * Overtime (Ci Ika). Admin melihat rekap semua.
 */
export default async function OvertimePage({ searchParams }: { searchParams: Promise<{ tab?: string; bulan?: string }> }) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const canUse = await canUseOvertime(prisma, user.employeeId);
  if (!canUse && !isAdmin) redirect("/akses-ditolak");

  const { tab, bulan } = await searchParams;
  // Admin tanpa hak overtime sendiri (bukan Engineer / tanpa data karyawan) langsung ke rekap.
  const activeTab = isAdmin && (tab === "rekap" || !canUse) ? "rekap" : "saya";
  const thisMonth = toJakartaIsoDate().slice(0, 7);
  const yearMonth = validMonth(bulan, thisMonth);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overtime"
        description="Catat setiap sesi lembur: Mulai Overtime saat mulai, Clock Out saat selesai lalu pilih customer & project. Sesi yang disetujui approver bisa diajukan lewat Reimburse Overtime."
        breadcrumbs={[{ label: "Utama" }, { label: "Overtime" }]}
        actions={
          canUse ? (
            <Link href="/reimburse/overtime" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <ReceiptText aria-hidden /> Reimburse Overtime
            </Link>
          ) : undefined
        }
      />
      {isAdmin && canUse && (
        <LinkTabs
          label="Overtime"
          active={activeTab}
          tabs={[
            { key: "saya", label: "Overtime Saya", href: "/overtime" },
            { key: "rekap", label: "Rekap Karyawan", href: "/overtime?tab=rekap" },
          ]}
        />
      )}
      {activeTab === "rekap" ? (
        <Recap yearMonth={yearMonth} thisMonth={thisMonth} viewerEmployeeId={user.employeeId} />
      ) : (
        <Mine employeeId={user.employeeId!} yearMonth={yearMonth} thisMonth={thisMonth} />
      )}
    </div>
  );
}

async function Mine({ employeeId, yearMonth, thisMonth }: { employeeId: string; yearMonth: string; thisMonth: string }) {
  const [open, rows, options] = await Promise.all([getOpenOvertime(prisma, employeeId), listOvertimes(prisma, employeeId, yearMonth), getOvertimeFinishOptions(prisma)]);
  return (
    <>
      <OvertimeClockCard open={open} options={options} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Riwayat Overtime</h2>
        <MonthNav yearMonth={yearMonth} baseHref="/overtime" maxMonth={thisMonth} />
      </div>
      <Stats rows={rows} />
      <OvertimeTable rows={rows} viewerEmployeeId={employeeId} options={options} />
    </>
  );
}

async function Recap({ yearMonth, thisMonth, viewerEmployeeId }: { yearMonth: string; thisMonth: string; viewerEmployeeId: string | null }) {
  const rows = await listOvertimes(prisma, null, yearMonth);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Rekap Overtime Karyawan</h2>
        <MonthNav yearMonth={yearMonth} baseHref="/overtime?tab=rekap" maxMonth={thisMonth} />
      </div>
      <Stats rows={rows} />
      <OvertimeTable rows={rows} withEmployee viewerEmployeeId={viewerEmployeeId} />
    </>
  );
}

function Stats({ rows }: { rows: OvertimeRow[] }) {
  const approved = rows.filter((r) => r.status === "APPROVED");
  const pending = rows.filter((r) => r.status === "PENDING").length;
  const notReimbursed = approved.filter((r) => !r.reimbursement).length;
  return (
    <div className={`${STAT_GRID} sm:grid-cols-3`}>
      <StatCard
        label="Sesi disetujui"
        value={approved.length}
        unit="sesi"
        icon={Timer}
        tone="info"
        footer={pending ? `${pending} sesi menunggu approval` : undefined}
      />
      <StatCard label="Total durasi disetujui" value={formatDuration(approved.reduce((sum, r) => sum + r.minutes, 0))} icon={Clock} tone="info" />
      <StatCard label="Belum di-reimburse" value={notReimbursed} unit="sesi" icon={ReceiptText} tone={notReimbursed ? "warning" : "success"} />
    </div>
  );
}
