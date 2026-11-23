"use server";

// Booking ruang meeting (Fase 17, 2026-11-23): tanpa approval. Email konfirmasi di-enqueue SETELAH transaksi commit.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { buildMeetingBookingEmail } from "@/lib/mail/meeting-booking-emails";
import { enqueueEmails } from "@/lib/mail/queue";
import {
  cancelMeetingBooking,
  createMeetingBooking,
  type MeetingBookingEvent,
  saveMeetingHours,
  setMeetingRoomActive,
  updateMeetingBooking,
} from "@/lib/services/meeting-room";
import { cancelMeetingBookingSchema, meetingBookingSchema, meetingHoursSchema, meetingRoomActiveSchema } from "@/lib/validators/meeting-room";

const idSchema = z.string().min(1);

function revalidateMeeting() {
  revalidatePath("/ruang-meeting", "layout");
}

/**
 * Jalankan aksi booking. Halaman selalu di-revalidate — juga saat gagal, supaya booking orang lain yang baru saja
 * mengambil slot itu langsung terlihat di kalender.
 */
async function runBookingAction(run: () => Promise<MeetingBookingEvent>): Promise<ActionResult> {
  try {
    const event = await run();
    revalidateMeeting();
    await enqueueEmails(prisma, [buildMeetingBookingEmail(event)]);
    return { ok: true, data: undefined };
  } catch (error) {
    revalidateMeeting();
    return toActionError(error);
  }
}

export async function createMeetingBookingAction(values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  return runBookingAction(() => createMeetingBooking(prisma, user, meetingBookingSchema.parse(values)));
}

/** Ubah booking milik sendiri — hanya satu kali per booking. */
export async function updateMeetingBookingAction(bookingId: string, values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  return runBookingAction(() => updateMeetingBooking(prisma, user, idSchema.parse(bookingId), meetingBookingSchema.parse(values)));
}

/** Batal: pemilik sebelum jam mulai; Admin booking siapa pun (alasan wajib bila bukan miliknya, dicek service). */
export async function cancelMeetingBookingAction(bookingId: string, values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  return runBookingAction(() => cancelMeetingBooking(prisma, user, idSchema.parse(bookingId), cancelMeetingBookingSchema.parse(values ?? {})));
}

// Setting → Ruang Meeting (Admin)

export async function saveMeetingHoursAction(values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await saveMeetingHours(prisma, admin.id, meetingHoursSchema.parse(values));
    revalidatePath("/setting/ruang-meeting");
    revalidateMeeting();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setMeetingRoomActiveAction(values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const { roomId, isActive } = meetingRoomActiveSchema.parse(values);
    await setMeetingRoomActive(prisma, admin.id, roomId, isActive);
    revalidatePath("/setting/ruang-meeting");
    revalidateMeeting();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
