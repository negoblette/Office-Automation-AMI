"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { ServiceError } from "@/lib/services/errors";
import { addHolidays, deleteHoliday, restoreHoliday, submitLeaveRequest } from "@/lib/services/leave";
import {
  browserHolidayFeedsSchema,
  holidayImportSchema,
  holidaySchema,
  leaveAdjustmentSchema,
  leaveRequestSchema,
  parseHolidayLines,
} from "@/lib/validators/leave";
import { adjustLeaveBalance } from "@/lib/services/leave-adjust";
import { enqueueJob } from "@/lib/mail/queue";
import { HOLIDAY_SYNC_QUEUE } from "@/lib/services/holiday-sync";
import { type ExternalHoliday, HolidaySourceError, holidaysFromBrowserFeeds } from "@/lib/holidays/google-calendar";
import { holidaySyncMode } from "@/lib/holidays/mode";

/**
 * Admin: jalankan sinkronisasi libur nasional sekarang (2026-11-18). Dikerjakan worker — hanya worker yang memegang token
 * API & akses internet; aplikasi web cukup mengirim job. Maksimal sekali per menit (klik berulang diabaikan).
 */
export async function syncHolidaysNowAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  // Mode browser: worker tidak boleh mengunduh sendiri (server tanpa internet) — tombol memakai syncHolidaysFromBrowserAction.
  if (holidaySyncMode() === "browser") return { ok: false, error: "Server ini memakai sinkronisasi lewat browser — muat ulang halaman, lalu coba lagi" };
  try {
    await enqueueJob(HOLIDAY_SYNC_QUEUE, { requestedBy: admin.id }, { singletonKey: "holiday-sync", singletonSeconds: 60 });
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[holiday.sync] gagal masuk antrian", error);
    return { ok: false, error: "Gagal menjalankan sinkronisasi — pastikan worker berjalan" };
  }
}

/**
 * Admin, mode browser (2026-11-27 — server produksi tanpa internet): browser Admin sudah mengambil kalender Google;
 * server hanya menerima, memvalidasi (ukuran, tanggal, nama, penanda, kecocokan feed Indonesia & Inggris), lalu worker
 * menjalankan sinkronisasi yang sama dengan mode server (konfirmasi ≥ 20 jam, rem, libur manual aman, notifikasi).
 */
export async function syncHolidaysFromBrowserAction(values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (holidaySyncMode() !== "browser") return { ok: false, error: "Sinkronisasi lewat browser tidak aktif di server ini" };
  let holidays: ExternalHoliday[];
  try {
    holidays = holidaysFromBrowserFeeds(browserHolidayFeedsSchema.parse(values));
  } catch (error) {
    if (error instanceof HolidaySourceError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: "Data kalender Google dari browser tidak dikenali — sinkronisasi dihentikan" };
    throw error;
  }
  try {
    await enqueueJob(HOLIDAY_SYNC_QUEUE, { requestedBy: admin.id, holidays }, { singletonKey: "holiday-sync", singletonSeconds: 60 });
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[holiday.sync] gagal masuk antrian", error);
    return { ok: false, error: "Gagal menjalankan sinkronisasi — pastikan worker berjalan" };
  }
}

function revalidateLeave() {
  revalidatePath("/cuti", "layout");
  revalidatePath("/approval");
}

/** Ajukan cuti untuk diri sendiri (LV-06). Email approval di-enqueue setelah commit. */
export async function submitLeaveAction(values: unknown, reviseId?: string | null): Promise<ActionResult<{ number: string }>> {
  const user = await requireUser();
  try {
    const result = await submitLeaveRequest(prisma, user, leaveRequestSchema.parse(values), z.string().min(1).nullish().parse(reviseId) ?? undefined);
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

/** Kembalikan libur yang dikeluarkan Admin (2026-11-27) — tanggalnya dihitung libur lagi. */
export async function restoreHolidayAction(holidayId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await restoreHoliday(prisma, admin.id, z.string().min(1).parse(holidayId));
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
    await adjustLeaveBalance(prisma, admin.id, z.string().min(1).parse(employeeId), leaveAdjustmentSchema.parse(values));
    revalidateLeave();
    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
