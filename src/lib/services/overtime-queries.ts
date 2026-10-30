// Query halaman Overtime & pilihan overtime di form reimburse. Hasil aman dikirim ke Client Component (tanpa Date).
import type { Prisma, PrismaClient, RequestStatus } from "@/generated/prisma/client";
import { formatTime, fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { projectLabel } from "@/lib/labels";
import { type OvertimeRates, overtimeMinutes } from "@/lib/validators/overtime";
import { monthRange } from "./attendance-queries";
import { getOvertimeRates, overtimeSessionAmount, overtimeWorkdays } from "./overtime";

export type OvertimeRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  /** Waktu clock in (ISO) — durasi berjalan dihitung di browser. */
  clockInAt: string;
  clockIn: string; // "HH:MM"
  clockOut: string | null;
  /** Tanggal clock out bila berbeda hari (lewat tengah malam). */
  clockOutDate: string | null;
  /** Durasi; untuk sesi berjalan = sampai sekarang. */
  minutes: number;
  /** Sabtu, Minggu, atau hari libur → tarif weekend (2026-10-30). */
  weekend: boolean;
  customerName: string | null;
  projectName: string | null;
  activity: string | null;
  /** Reimburse yang memakai sesi ini (draft hanya terlihat pemiliknya). */
  reimbursement: { id: string; number: string | null; status: RequestStatus } | null;
};

const include = {
  employee: { select: { fullName: true } },
  customer: { select: { name: true } },
  project: { select: { code: true, name: true } },
  reimbursementItem: { select: { reimbursement: { select: { id: true, number: true, status: true, deletedAt: true } } } },
} satisfies Prisma.OvertimeInclude;

type OvertimeWithRelations = Prisma.OvertimeGetPayload<{ include: typeof include }>;

function toRow(o: OvertimeWithRelations, now: Date, workday: (date: Date) => boolean): OvertimeRow {
  const end = o.clockOut ?? now;
  const outDate = o.clockOut ? toJakartaIsoDate(o.clockOut) : null;
  const date = toJakartaIsoDate(o.date);
  const r = o.reimbursementItem?.reimbursement;
  return {
    id: o.id,
    employeeId: o.employeeId,
    employeeName: o.employee.fullName,
    date,
    clockInAt: o.clockIn.toISOString(),
    clockIn: formatTime(o.clockIn),
    clockOut: o.clockOut ? formatTime(o.clockOut) : null,
    clockOutDate: outDate && outDate !== date ? outDate : null,
    minutes: overtimeMinutes(o.clockIn, end),
    weekend: !workday(o.date),
    customerName: o.customer?.name ?? null,
    projectName: o.project ? projectLabel(o.project) : null,
    activity: o.activity,
    reimbursement: r && !r.deletedAt ? { id: r.id, number: r.status === "DRAFT" ? null : r.number, status: r.status } : null,
  };
}

/** Sesi yang masih berjalan milik karyawan (paling banyak satu). */
export async function getOpenOvertime(db: PrismaClient, employeeId: string, now = new Date()): Promise<OvertimeRow | null> {
  const open = await db.overtime.findFirst({ where: { employeeId, clockOut: null }, include });
  return open ? toRow(open, now, await overtimeWorkdays(db, [open.date])) : null;
}

/**
 * Sesi overtime satu bulan (tanggal clock in), urut tanggal lalu jam — beberapa sesi di hari yang sama tampil sebagai
 * baris berurutan. `employeeId` null = semua karyawan (rekap Admin).
 */
export async function listOvertimes(db: PrismaClient, employeeId: string | null, yearMonth: string, now = new Date()): Promise<OvertimeRow[]> {
  const { start, end } = monthRange(yearMonth);
  const rows = await db.overtime.findMany({
    where: { ...(employeeId ? { employeeId } : {}), date: { gte: fromIsoDate(start), lte: fromIsoDate(end) } },
    orderBy: [{ date: "desc" }, { clockIn: "asc" }],
    include,
  });
  const workday = await overtimeWorkdays(db, rows.map((row) => row.date));
  return rows.map((row) => toRow(row, now, workday));
}

/** Pilihan di dialog Clock Out: customer master & project aktif (project difilter per customer di form). */
export async function getOvertimeFinishOptions(db: PrismaClient) {
  const [customers, projects] = await Promise.all([
    db.customer.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.project.findMany({
      where: { isActive: true },
      orderBy: [{ customer: { name: "asc" } }, { name: "asc" }],
      select: { id: true, code: true, name: true, customerId: true },
    }),
  ]);
  return {
    customers: customers.map((c) => ({ value: c.id, label: c.name })),
    projects: projects.map((p) => ({ value: p.id, label: projectLabel(p), customerId: p.customerId })),
  };
}

export type OvertimeFinishOptions = Awaited<ReturnType<typeof getOvertimeFinishOptions>>;

/** `amount` null = tarif untuk jenis harinya (weekday / weekend & libur) belum diatur → belum bisa dipilih. */
export type ReimbursableOvertime = OvertimeRow & { amount: number | null };

/**
 * Pilihan "Overtime" di form reimburse: sesi selesai milik karyawan yang belum dipakai reimburse lain (sesi yang sudah
 * ada di reimburse yang sedang diubah tetap muncul). Nominal = durasi × tarif per jam saat ini (weekday / weekend & libur).
 */
export async function listReimbursableOvertimes(
  db: PrismaClient,
  employeeId: string,
  reimbursementId: string | null,
): Promise<{ rates: OvertimeRates; overtimes: ReimbursableOvertime[] }> {
  const [rates, rows] = await Promise.all([
    getOvertimeRates(db),
    db.overtime.findMany({
      where: {
        employeeId,
        clockOut: { not: null },
        OR: [{ reimbursementItem: null }, ...(reimbursementId ? [{ reimbursementItem: { reimbursementId } }] : [])],
      },
      orderBy: [{ date: "asc" }, { clockIn: "asc" }],
      include,
    }),
  ]);
  const now = new Date();
  const workday = await overtimeWorkdays(db, rows.map((row) => row.date));
  return {
    rates,
    overtimes: rows.map((row) => ({ ...toRow(row, now, workday), amount: overtimeSessionAmount(rates, workday(row.date), row.clockIn, row.clockOut!) })),
  };
}
