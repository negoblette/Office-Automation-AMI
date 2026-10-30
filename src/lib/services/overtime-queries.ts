// Query halaman Overtime & pilihan di Reimburse Overtime. Hasil aman dikirim ke Client Component (tanpa Date).
import type { Prisma, PrismaClient, RequestStatus } from "@/generated/prisma/client";
import { formatTime, fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { projectLabel } from "@/lib/labels";
import { overtimeMinutes } from "@/lib/validators/overtime";
import { type RejectionInfo, rejectionsOf } from "./approval";
import { monthRange } from "./attendance-queries";
import { overtimeWorkdays } from "./overtime";

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
  /** Sabtu, Minggu, atau hari libur. */
  weekend: boolean;
  customerId: string | null;
  customerName: string | null;
  projectId: string | null;
  projectName: string | null;
  activity: string | null;
  /** Nomor approval OVT/… (setelah finalize). */
  number: string | null;
  /** DRAFT = masih berjalan; PENDING/APPROVED/REJECTED = approval (Ko Yosep). */
  status: RequestStatus;
  /** Level approval yang sedang menunggu (status PENDING). */
  currentLevel: number | null;
  rejection: RejectionInfo | null;
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

async function toRows(db: PrismaClient, rows: OvertimeWithRelations[], now = new Date()): Promise<OvertimeRow[]> {
  const ids = rows.map((o) => o.id);
  const [workday, rejections, requests] = await Promise.all([
    overtimeWorkdays(db, rows.map((o) => o.date)),
    rejectionsOf(db, "OVERTIME", rows.filter((o) => o.status === "REJECTED").map((o) => o.id)),
    ids.length ? db.approvalRequest.findMany({ where: { module: "OVERTIME", entityId: { in: ids } }, select: { entityId: true, currentLevel: true } }) : [],
  ]);
  const levelOf = new Map(requests.map((r) => [r.entityId, r.currentLevel]));
  return rows.map((o) => {
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
      minutes: overtimeMinutes(o.clockIn, o.clockOut ?? now),
      weekend: !workday(o.date),
      customerId: o.customerId,
      customerName: o.customer?.name ?? null,
      projectId: o.projectId,
      projectName: o.project ? projectLabel(o.project) : null,
      activity: o.activity,
      number: o.number,
      status: o.status,
      currentLevel: levelOf.get(o.id) ?? null,
      rejection: rejections.get(o.id) ?? null,
      reimbursement: r && !r.deletedAt ? { id: r.id, number: r.status === "DRAFT" ? null : r.number, status: r.status } : null,
    };
  });
}

/** Sesi yang masih berjalan milik karyawan (paling banyak satu). */
export async function getOpenOvertime(db: PrismaClient, employeeId: string): Promise<OvertimeRow | null> {
  const open = await db.overtime.findFirst({ where: { employeeId, clockOut: null }, include });
  return open ? (await toRows(db, [open]))[0] : null;
}

/**
 * Sesi overtime satu bulan (tanggal clock in), urut tanggal lalu jam — beberapa sesi di hari yang sama tampil sebagai
 * baris berurutan. `employeeId` null = semua karyawan (rekap Admin).
 */
export async function listOvertimes(db: PrismaClient, employeeId: string | null, yearMonth: string): Promise<OvertimeRow[]> {
  const { start, end } = monthRange(yearMonth);
  const rows = await db.overtime.findMany({
    where: { ...(employeeId ? { employeeId } : {}), date: { gte: fromIsoDate(start), lte: fromIsoDate(end) } },
    orderBy: [{ date: "desc" }, { clockIn: "asc" }],
    include,
  });
  return toRows(db, rows);
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

/**
 * Pilihan di form Reimburse Overtime: sesi DISETUJUI milik karyawan yang belum dipakai reimburse lain (sesi yang sudah
 * ada di reimburse yang sedang diubah tetap muncul).
 */
export async function listReimbursableOvertimes(db: PrismaClient, employeeId: string, reimbursementId: string | null): Promise<OvertimeRow[]> {
  const rows = await db.overtime.findMany({
    where: {
      employeeId,
      status: "APPROVED",
      OR: [{ reimbursementItem: null }, ...(reimbursementId ? [{ reimbursementItem: { reimbursementId } }] : [])],
    },
    orderBy: [{ date: "asc" }, { clockIn: "asc" }],
    include,
  });
  return toRows(db, rows);
}
