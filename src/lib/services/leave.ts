// Pengajuan cuti — URD LV-05..08, Tech Spec §6.2. Diajukan langsung (tanpa draft) ke approval engine.
import type { PrismaClient } from "@/generated/prisma/client";
import { formatDate, fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { countWorkingDays, firstUsableDate, leaveYear, remainingDays } from "@/lib/leave";
import type { HolidayInput, LeavePolicySettingInput, LeaveRequestInput } from "@/lib/validators/leave";
import type { Actor } from "./access";
import { type ApprovalNotification, buildApproval } from "./approval";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { currentEmploymentStart, ensureLeaveBalance, MAX_CARRY_OVER_KEY } from "./leave-balance";
import { nextDocumentNumber } from "./numbering";

export async function holidaySet(db: Pick<PrismaClient, "holiday">, startIso: string, endIso: string) {
  const holidays = await db.holiday.findMany({ where: { deletedAt: null, date: { gte: fromIsoDate(startIso), lte: fromIsoDate(endIso) } } });
  return new Set(holidays.map((holiday) => toJakartaIsoDate(holiday.date)));
}

export type SubmitLeaveResult = {
  leaveRequestId: string;
  number: string;
  workingDays: number;
  status: "PENDING" | "APPROVED";
  notifications: ApprovalNotification[];
};

export async function submitLeaveRequest(db: PrismaClient, actor: Actor, input: LeaveRequestInput): Promise<SubmitLeaveResult> {
  if (!actor.employeeId) throw new ServiceError("Akun Anda belum terhubung ke data karyawan");
  const employeeId = actor.employeeId;

  return db.$transaction(async (tx) => {
    const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: { status: true } });
    if (employee?.status !== "ACTIVE") throw new ServiceError("Hanya karyawan aktif yang bisa mengajukan cuti");

    // Satu pengajuan harus berada dalam satu tahun kalender (saldo per tahun, cutoff 31 Des).
    const employmentStart = await currentEmploymentStart(tx, employeeId);
    if (input.startDate < employmentStart) throw new ServiceError("Tanggal cuti sebelum tanggal masuk kerja", "startDate");
    const period = leaveYear(employmentStart, input.startDate);
    if (!period.eligibleFrom || input.startDate < period.eligibleFrom) {
      const from = firstUsableDate(employmentStart);
      throw new ServiceError(`Cuti baru bisa dipakai setelah genap 1 tahun masa kerja (mulai ${formatDate(`${from}T00:00:00Z`)})`, "startDate");
    }
    if (input.endDate > period.end) {
      throw new ServiceError(`Pengajuan melewati akhir tahun (${period.end}). Pisahkan menjadi dua pengajuan.`, "endDate");
    }

    const workingDays = countWorkingDays(input.startDate, input.endDate, await holidaySet(tx, input.startDate, input.endDate));
    if (workingDays === 0) throw new ServiceError("Rentang tanggal tidak berisi hari kerja", "endDate");

    const overlap = await tx.leaveRequest.findFirst({
      where: {
        employeeId,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: fromIsoDate(input.endDate) },
        endDate: { gte: fromIsoDate(input.startDate) },
      },
    });
    if (overlap) throw new ServiceError(`Tanggal bertabrakan dengan cuti ${overlap.number}`, "startDate");

    // Kunci baris saldo supaya dua pengajuan bersamaan tidak melewati sisa saldo.
    const balance = await ensureLeaveBalance(tx, employeeId, input.startDate);
    await tx.$queryRaw`SELECT id FROM "LeaveBalance" WHERE id = ${balance.id} FOR UPDATE`;
    const pending = await tx.leaveRequest.aggregate({
      _sum: { workingDays: true },
      where: {
        employeeId,
        status: "PENDING",
        startDate: { gte: fromIsoDate(period.start), lte: fromIsoDate(period.end) },
      },
    });
    const fresh = await tx.leaveBalance.findUniqueOrThrow({ where: { id: balance.id } });
    const remaining = remainingDays(fresh, pending._sum.workingDays ?? 0);
    if (workingDays > remaining) {
      throw new ServiceError(`Sisa saldo cuti ${Math.max(0, remaining)} hari, pengajuan ${workingDays} hari kerja (LV-08)`, "endDate");
    }

    const number = await nextDocumentNumber(tx, "LV");
    const request = await tx.leaveRequest.create({
      data: {
        number,
        employeeId,
        startDate: fromIsoDate(input.startDate),
        endDate: fromIsoDate(input.endDate),
        workingDays,
        reason: input.reason,
        status: "PENDING",
        submittedAt: new Date(),
      },
    });
    const approval = await buildApproval(tx, { module: "LEAVE", entityId: request.id, entityNumber: number, requesterId: actor.id });
    await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "LeaveRequest", entityId: request.id, after: request });

    return { leaveRequestId: request.id, number, workingDays, status: approval.status, notifications: approval.notifications };
  });
}

// ---------------------------------------------------------------------
// Setting & kalender (Admin)
// ---------------------------------------------------------------------

export async function addHolidays(db: PrismaClient, actorId: string, holidays: HolidayInput[]) {
  return db.$transaction(async (tx) => {
    let added = 0;
    for (const holiday of holidays) {
      const date = fromIsoDate(holiday.date);
      const existing = await tx.holiday.findUnique({ where: { date } });
      if (existing && !existing.deletedAt) continue;
      // Tanggal yang pernah dihapus (soft delete) dipulihkan dengan nama baru.
      const saved = existing
        ? await tx.holiday.update({ where: { id: existing.id }, data: { name: holiday.name, isNational: holiday.isNational, deletedAt: null } })
        : await tx.holiday.create({ data: { date, name: holiday.name, isNational: holiday.isNational } });
      await logAudit(tx, { actorId, action: "CREATE", entity: "Holiday", entityId: saved.id, before: existing, after: saved });
      added++;
    }
    return { added, skipped: holidays.length - added };
  });
}

export async function deleteHoliday(db: PrismaClient, actorId: string, holidayId: string) {
  return db.$transaction(async (tx) => {
    const holiday = await tx.holiday.findUnique({ where: { id: holidayId } });
    if (!holiday || holiday.deletedAt) throw new ServiceError("Hari libur tidak ditemukan");
    await tx.holiday.update({ where: { id: holidayId }, data: { deletedAt: new Date() } });
    await logAudit(tx, { actorId, action: "DELETE", entity: "Holiday", entityId: holidayId, before: holiday });
  });
}

/**
 * Simpan jatah cuti per masa kerja & batas carry over. Berlaku untuk saldo periode BARU;
 * saldo yang sudah terbentuk tidak diubah.
 */
export async function saveLeavePolicies(db: PrismaClient, actorId: string, input: LeavePolicySettingInput) {
  return db.$transaction(async (tx) => {
    const before = { policies: await tx.leavePolicy.findMany({ orderBy: { minYears: "asc" } }), maxCarryOver: await tx.appSetting.findUnique({ where: { key: MAX_CARRY_OVER_KEY } }) };
    await tx.leavePolicy.deleteMany();
    await tx.leavePolicy.createMany({ data: input.policies });
    await tx.appSetting.upsert({ where: { key: MAX_CARRY_OVER_KEY }, create: { key: MAX_CARRY_OVER_KEY, value: input.maxCarryOver }, update: { value: input.maxCarryOver } });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "LeavePolicy", entityId: "all", before, after: input });
  });
}
