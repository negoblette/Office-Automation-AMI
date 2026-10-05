"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { ServiceError } from "@/lib/services/errors";
import { addHolidays, deleteHoliday, submitLeaveRequest } from "@/lib/services/leave";
import { holidayImportSchema, holidaySchema, leaveAdjustmentSchema, leaveRequestSchema, parseHolidayLines } from "@/lib/validators/leave";
import { addLeaveAdjustment } from "@/lib/services/leave-balance";
import { toJakartaIsoDate } from "@/lib/format";

function revalidateLeave() {
  revalidatePath("/cuti", "layout");
  revalidatePath("/approval");
}

/** Ajukan cuti untuk diri sendiri (LV-06). Email approval di-enqueue setelah commit. */
export async function submitLeaveAction(values: unknown): Promise<ActionResult<{ number: string }>> {
  const user = await requireUser();
  try {
    const result = await submitLeaveRequest(prisma, user, leaveRequestSchema.parse(values));
    await enqueueApprovalNotifications(prisma, result.notifications);
    revalidateLeave();
    return { ok: true, data: { number: result.number } };
  } catch (error) {
    return toActionError(error);
  }
}

/** Tambah satu hari libur (LV-04, Admin). */
export async function addHolidayAction(values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const holiday = holidaySchema.parse(values);
    const { added } = await addHolidays(prisma, admin.id, [holiday]);
    if (!added) throw new ServiceError("Tanggal ini sudah terdaftar sebagai hari libur", "date");
    revalidateLeave();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Impor banyak libur (mis. daftar libur nasional setahun), satu per baris "YYYY-MM-DD Nama". */
export async function importHolidaysAction(values: unknown): Promise<ActionResult<{ added: number; skipped: number }>> {
  const admin = await requireAdmin();
  try {
    const { text, isNational } = holidayImportSchema.parse(values);
    const { holidays, invalidLines } = parseHolidayLines(text);
    if (invalidLines.length) throw new ServiceError(`Format salah di baris ${invalidLines.join(", ")}. Gunakan "YYYY-MM-DD Nama libur".`, "text");
    if (!holidays.length) throw new ServiceError("Tidak ada baris untuk diimpor", "text");
    const result = await addHolidays(prisma, admin.id, holidays.map((h) => ({ ...h, isNational })));
    revalidateLeave();
    return { ok: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteHolidayAction(holidayId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await deleteHoliday(prisma, admin.id, z.string().min(1).parse(holidayId));
    revalidateLeave();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Pemutihan / penyesuaian saldo cuti karyawan (Fase 14): ± hari, alasan wajib, tercatat. */
export async function adjustLeaveBalanceAction(employeeId: string, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const input = leaveAdjustmentSchema.parse(values);
    await prisma.$transaction((tx) =>
      addLeaveAdjustment(tx, {
        employeeId: z.string().min(1).parse(employeeId),
        refIso: toJakartaIsoDate(),
        days: input.days,
        reason: input.reason,
        source: "MANUAL",
        createdById: admin.id,
      }),
    );
    revalidateLeave();
    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
