import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { toJakartaIsoDate } from "@/lib/format";
import { listMonthDays } from "@/lib/services/attendance-queries";
import { AddCorrectionButton, AttendanceDaysTable, MonthNav } from "../attendance-ui";

export const metadata: Metadata = { title: "Absensi Karyawan" };

export default async function AbsensiKaryawanPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ bulan?: string }>;
}) {
  await requireAdmin();
  const [{ employeeId }, { bulan }] = await Promise.all([params, searchParams]);
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, fullName: true, position: true } });
  if (!employee) notFound();

  const todayIso = toJakartaIsoDate();
  const thisMonth = todayIso.slice(0, 7);
  const yearMonth = bulan && /^\d{4}-(0[1-9]|1[0-2])$/.test(bulan) && bulan <= thisMonth ? bulan : thisMonth;
  const days = await listMonthDays(prisma, employee.id, yearMonth, todayIso);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Absensi ${employee.fullName}`}
        description={`${employee.position} · koreksi absen wajib disertai alasan dan tercatat di audit log.`}
        breadcrumbs={[{ label: "Utama" }, { label: "Absensi", href: "/absensi?tab=rekap" }, { label: employee.fullName }]}
        actions={<AddCorrectionButton employeeId={employee.id} defaultDate={todayIso} />}
      />
      <MonthNav yearMonth={yearMonth} baseHref={`/absensi/${employee.id}`} maxMonth={thisMonth} />
      <AttendanceDaysTable days={days} correctFor={employee.id} />
    </div>
  );
}
