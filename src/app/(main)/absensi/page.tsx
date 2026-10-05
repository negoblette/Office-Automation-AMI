import { AlarmClock, CalendarX, Clock, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { PersonCell } from "@/components/shared/person-cell";
import { StatCard } from "@/components/shared/stat-card";
import { formatDuration } from "@/lib/attendance";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { toJakartaIsoDate } from "@/lib/format";
import { DIVISION_LABEL } from "@/lib/labels";
import { getTodayAttendance, listMonthDays, monthSummary } from "@/lib/services/attendance-queries";
import { AttendanceDaysTable, ClockCard, DayStatusBadge, MonthNav } from "./attendance-ui";

export const metadata: Metadata = { title: "Absensi" };

const validMonth = (value: string | undefined, max: string) => (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value <= max ? value : max);

export default async function AbsensiPage({ searchParams }: { searchParams: Promise<{ tab?: string; bulan?: string }> }) {
  const user = await requireUser();
  const { tab, bulan } = await searchParams;
  const isAdmin = user.role === "ADMIN";
  const activeTab = isAdmin && tab === "rekap" ? "rekap" : "saya";
  const todayIso = toJakartaIsoDate();
  const thisMonth = todayIso.slice(0, 7);
  const yearMonth = validMonth(bulan, thisMonth);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Absensi"
        description="Clock in saat mulai kerja dan clock out saat pulang — jam dicatat otomatis dari server (WIB)."
        breadcrumbs={[{ label: "Utama" }, { label: "Absensi" }]}
      />
      {isAdmin && (
        <LinkTabs
          label="Absensi"
          active={activeTab}
          tabs={[
            { key: "saya", label: "Absensi Saya", href: "/absensi" },
            { key: "rekap", label: "Rekap Karyawan", href: "/absensi?tab=rekap" },
          ]}
        />
      )}
      {activeTab === "rekap" ? <Recap yearMonth={yearMonth} thisMonth={thisMonth} todayIso={todayIso} /> : <Mine employeeId={user.employeeId} yearMonth={yearMonth} thisMonth={thisMonth} />}
    </div>
  );
}

async function Mine({ employeeId, yearMonth, thisMonth }: { employeeId: string | null; yearMonth: string; thisMonth: string }) {
  const [today, days] = employeeId
    ? await Promise.all([getTodayAttendance(prisma, employeeId), listMonthDays(prisma, employeeId, yearMonth)])
    : [null, []];
  const late = days.filter((d) => d.lateMinutes > 0);
  return (
    <>
      <ClockCard today={today} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Riwayat Absensi</h2>
        <MonthNav yearMonth={yearMonth} baseHref="/absensi" maxMonth={thisMonth} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Hadir" value={days.filter((d) => d.clockIn).length} unit="hari" icon={UserCheck} tone="success" />
        <StatCard
          label="Terlambat"
          value={late.length}
          unit="hari"
          icon={AlarmClock}
          tone={late.length ? "warning" : "success"}
          footer={late.length ? `Total ${formatDuration(late.reduce((sum, d) => sum + d.lateMinutes, 0))}` : undefined}
        />
        <StatCard label="Tidak hadir / tidak clock out" value={days.filter((d) => d.status === "ABSENT" || d.status === "NO_CLOCK_OUT").length} unit="hari" icon={CalendarX} tone="danger" />
      </div>
      <AttendanceDaysTable days={days} appealable />
    </>
  );
}

async function Recap({ yearMonth, thisMonth, todayIso }: { yearMonth: string; thisMonth: string; todayIso: string }) {
  const rows = await monthSummary(prisma, yearMonth, todayIso);
  const isCurrent = yearMonth === thisMonth;
  const clockedToday = rows.filter((r) => r.today?.clockIn).length;
  const lateToday = rows.filter((r) => (r.today?.lateMinutes ?? 0) > 0).length;

  return (
    <>
      {isCurrent && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Sudah clock in hari ini" value={clockedToday} unit={`/ ${rows.length} karyawan`} icon={UserCheck} tone="success" />
          <StatCard label="Terlambat hari ini" value={lateToday} icon={AlarmClock} tone={lateToday ? "warning" : "success"} />
          <StatCard label="Cuti hari ini" value={rows.filter((r) => r.today?.status === "LEAVE").length} icon={Clock} tone="info" />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Rekap per Karyawan</h2>
        <MonthNav yearMonth={yearMonth} baseHref="/absensi?tab=rekap" maxMonth={thisMonth} />
      </div>
      <div className="overflow-x-auto rounded-2xl bg-card shadow-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs tracking-wider text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">Karyawan</th>
              {isCurrent && <th className="px-4 py-3 font-semibold">Hari ini</th>}
              <th className="px-4 py-3 text-right font-semibold">Hadir</th>
              <th className="px-4 py-3 text-right font-semibold">Terlambat</th>
              <th className="px-4 py-3 text-right font-semibold">Tidak clock out</th>
              <th className="px-4 py-3 text-right font-semibold">Cuti</th>
              <th className="px-4 py-3 text-right font-semibold">Sakit</th>
              <th className="px-4 py-3 text-right font-semibold">Kunjungan</th>
              <th className="px-4 py-3 text-right font-semibold">Tidak hadir</th>
              <th className="px-4 py-3 text-right font-semibold">Cuti dipotong</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employeeId} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5">
                  <Link href={`/absensi/${row.employeeId}?bulan=${yearMonth}`} className="block hover:underline">
                    <PersonCell name={row.name} subtitle={`${row.position} · ${DIVISION_LABEL[row.division as keyof typeof DIVISION_LABEL]}`} />
                  </Link>
                </td>
                {isCurrent && (
                  <td className="px-4 py-2.5">
                    {row.today && (
                      <div className="flex flex-col items-start gap-0.5">
                        <DayStatusBadge status={row.today.status} />
                        {row.today.clockIn && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {row.today.clockIn}
                            {row.today.clockOut ? ` – ${row.today.clockOut}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                )}
                <td className="px-4 py-2.5 text-right tabular-nums">{row.present}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {row.late}
                  {row.lateMinutes > 0 && <span className="block text-xs text-muted-foreground">{formatDuration(row.lateMinutes)}</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.noClockOut}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.leave}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.sick}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.visit}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${row.absent ? "font-semibold text-danger" : ""}`}>{row.absent}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${row.deducted ? "font-semibold text-danger" : ""}`}>{row.deducted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
