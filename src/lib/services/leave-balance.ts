// Saldo cuti (LeaveBalance) — Tech Spec §6.2. Tidak mengimpor approval engine supaya bisa dipakai
// approval-effects.ts (efek final) dan worker (leave.rollover) tanpa import melingkar.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { leaveYear, nextCarryOver, yearEntitlement } from "@/lib/leave";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

type Tx = Prisma.TransactionClient;

export const MAX_CARRY_OVER_KEY = "leave.maxCarryOver";

export async function getMaxCarryOver(tx: Tx): Promise<number> {
  const setting = await tx.appSetting.findUnique({ where: { key: MAX_CARRY_OVER_KEY } });
  return typeof setting?.value === "number" ? setting.value : 3;
}

/** Tanggal masuk periode kerja terbaru (rehire: hitungan cuti mulai dari nol lagi). */
export async function currentEmploymentStart(tx: Tx, employeeId: string): Promise<string> {
  const period = await tx.employmentPeriod.findFirst({ where: { employeeId }, orderBy: { startDate: "desc" } });
  if (!period) throw new ServiceError("Periode kerja karyawan tidak ditemukan");
  return toJakartaIsoDate(period.startDate);
}

/**
 * Saldo untuk tahun kalender yang memuat `refIso`; dibuat bila belum ada. Jatah dari LeavePolicy
 * menurut masa kerja per 1 Januari (tahun genap 1 tahun = prorata per bulan, lihat leaveYear); carry over
 * dari saldo tahun sebelumnya dalam periode kerja yang sama.
 */
export async function ensureLeaveBalance(tx: Tx, employeeId: string, refIso: string) {
  const employmentStart = await currentEmploymentStart(tx, employeeId);
  if (refIso < employmentStart) throw new ServiceError("Tanggal cuti sebelum tanggal masuk kerja");
  const period = leaveYear(employmentStart, refIso);
  const periodStart = fromIsoDate(period.start);

  const existing = await tx.leaveBalance.findUnique({ where: { employeeId_periodStart: { employeeId, periodStart } } });
  if (existing) return existing;

  const [policies, maxCarryOver] = await Promise.all([tx.leavePolicy.findMany(), getMaxCarryOver(tx)]);
  const entitlement = yearEntitlement(period, policies);

  // Carry over hanya dari tahun tepat sebelumnya, dan hanya dalam periode kerja yang sama.
  const previousYearEnd = `${Number(period.end.slice(0, 4)) - 1}-12-31`;
  const previous =
    employmentStart <= previousYearEnd
      ? await tx.leaveBalance.findUnique({
          where: { employeeId_periodStart: { employeeId, periodStart: fromIsoDate(leaveYear(employmentStart, previousYearEnd).start) } },
        })
      : null;
  const carriedOver = previous ? nextCarryOver(previous, maxCarryOver) : 0;

  // upsert: aman jika job rollover & pengajuan membuat saldo bersamaan.
  return tx.leaveBalance.upsert({
    where: { employeeId_periodStart: { employeeId, periodStart } },
    create: { employeeId, periodStart, periodEnd: fromIsoDate(period.end), entitlement, carriedOver },
    update: {},
  });
}

/** Efek final LEAVE (Tech Spec §4.3): status APPROVED dan saldo `used` bertambah. */
export async function applyApprovedLeave(tx: Tx, leaveRequestId: string, approvedAt: Date) {
  const request = await tx.leaveRequest.update({ where: { id: leaveRequestId }, data: { status: "APPROVED", approvedAt } });
  const balance = await ensureLeaveBalance(tx, request.employeeId, toJakartaIsoDate(request.startDate));
  await tx.leaveBalance.update({ where: { id: balance.id }, data: { used: { increment: request.workingDays } } });
}

/** Kebalikan `applyApprovedLeave` (approval final dibatalkan): status PENDING, saldo `used` dikembalikan. */
export async function revertApprovedLeave(tx: Tx, leaveRequestId: string) {
  const request = await tx.leaveRequest.update({ where: { id: leaveRequestId }, data: { status: "PENDING", approvedAt: null } });
  const balance = await ensureLeaveBalance(tx, request.employeeId, toJakartaIsoDate(request.startDate));
  await tx.leaveBalance.update({ where: { id: balance.id }, data: { used: { decrement: request.workingDays } } });
}

/** Job harian `leave.rollover`: pastikan setiap karyawan aktif punya saldo periode berjalan. */
export async function rolloverLeaveBalances(db: PrismaClient, todayIso = toJakartaIsoDate()): Promise<number> {
  const employees = await db.employee.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  let created = 0;
  for (const { id } of employees) {
    await db.$transaction(async (tx) => {
      const before = await tx.leaveBalance.count({ where: { employeeId: id } });
      const balance = await ensureLeaveBalance(tx, id, todayIso);
      if ((await tx.leaveBalance.count({ where: { employeeId: id } })) > before) {
        created++;
        await logAudit(tx, { actorId: null, action: "CREATE", entity: "LeaveBalance", entityId: balance.id, after: balance });
      }
    });
  }
  return created;
}

export type LeaveAdjustmentInput = {
  employeeId: string;
  /** Tanggal acuan periode saldo (tahun kalender) yang disesuaikan. */
  refIso: string;
  days: number;
  reason: string;
  source: "MANUAL" | "ABSENCE";
  /** ABSENCE: tanggal tidak hadir (unik per karyawan, cegah potong ganda). */
  attendanceDate?: string | null;
  createdById: string | null;
};

/**
 * Penyesuaian saldo cuti (Fase 14): pemutihan / koreksi Admin (+/−) atau potong otomatis karena
 * tidak hadir tanpa appeal (−1). Dicatat di LeaveAdjustment + audit; saldo boleh minus.
 */
export async function addLeaveAdjustment(tx: Tx, input: LeaveAdjustmentInput) {
  if (!Number.isInteger(input.days) || input.days === 0) throw new ServiceError("Jumlah hari penyesuaian tidak boleh 0", "days");
  const balance = await ensureLeaveBalance(tx, input.employeeId, input.refIso);
  const adjustment = await tx.leaveAdjustment.create({
    data: {
      balanceId: balance.id,
      employeeId: input.employeeId,
      days: input.days,
      reason: input.reason,
      source: input.source,
      attendanceDate: input.attendanceDate ? fromIsoDate(input.attendanceDate) : null,
      createdById: input.createdById,
    },
  });
  await tx.leaveBalance.update({ where: { id: balance.id }, data: { adjustment: { increment: input.days } } });
  await logAudit(tx, { actorId: input.createdById, action: "UPDATE", entity: "LeaveBalance", entityId: balance.id, after: { adjustment } });
  return adjustment;
}
