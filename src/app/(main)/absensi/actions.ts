"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { clockIn, clockOut, correctAttendance, saveWorkHours } from "@/lib/services/attendance";
import { appealDatesSchema, attendanceCorrectionSchema, workHoursSchema } from "@/lib/validators/attendance";
import { submitAppeals } from "@/lib/services/attendance-appeal";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";

function revalidateAttendance() {
  revalidatePath("/absensi", "layout");
  revalidatePath("/dashboard");
}

/** Clock in: employeeId dari session, jam dari server. */
export async function clockInAction(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await clockIn(prisma, user);
    revalidateAttendance();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function clockOutAction(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await clockOut(prisma, user);
    revalidateAttendance();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Koreksi absen karyawan oleh Admin (alasan wajib, tercatat di audit). */
export async function correctAttendanceAction(employeeId: string, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await correctAttendance(prisma, admin.id, z.string().min(1).parse(employeeId), attendanceCorrectionSchema.parse(values));
    revalidateAttendance();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveWorkHoursAction(values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await saveWorkHours(prisma, admin.id, workHoursSchema.parse(values));
    revalidatePath("/setting/absensi");
    revalidateAttendance();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Appeal tanggal-tanggal tidak hadir yang dicentang (2026-11-02): Sakit / Kunjungan keluar / Lainnya, approval Bu Ika. */
export async function submitAppealAction(values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const result = await submitAppeals(prisma, user, appealDatesSchema.parse(values));
    await enqueueApprovalNotifications(prisma, result.notifications);
    revalidateAttendance();
    revalidatePath("/approval");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
