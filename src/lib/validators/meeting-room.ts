// Validasi booking ruang meeting (Fase 17, 2026-11-23). Aturan tanggal/jam yang butuh "sekarang", jam operasional, dan
// Kalender Libur dicek di service (`bookingWindowProblem`); bentrok jadwal dicek database (exclusion constraint).
import { z } from "zod";
import { AGENDA_MAX_LENGTH, isSlotTime, SLOT_MINUTES } from "@/lib/meeting-room";
import { isoDateSchema, optionalField, textSchema } from "./common";

/** Jam `HH:MM` dari dropdown, kelipatan 30 menit. Belum dipilih (string kosong) → "Jam wajib dipilih". */
const slotTimeSchema = z
  .string({ error: "Jam wajib dipilih" })
  .min(1, { error: "Jam wajib dipilih" })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Format jam HH:MM" })
  .refine((value) => !/^\d{2}:\d{2}$/.test(value) || isSlotTime(value), { error: `Jam harus kelipatan ${SLOT_MINUTES} menit` });

/** Buat & ubah booking: ruang, tanggal, jam mulai–selesai, agenda (wajib). */
export const meetingBookingSchema = z
  .object({
    roomId: z.string({ error: "Ruang wajib dipilih" }).min(1, { error: "Ruang wajib dipilih" }),
    date: isoDateSchema,
    start: slotTimeSchema,
    end: slotTimeSchema,
    agenda: textSchema("Agenda", { min: 3, max: AGENDA_MAX_LENGTH }),
  })
  .refine((v) => v.end > v.start, { path: ["end"], error: "Jam selesai harus setelah jam mulai" });
export type MeetingBookingInput = z.infer<typeof meetingBookingSchema>;

/** Batal: alasan opsional, tetapi wajib (dicek service) bila Admin membatalkan booking milik orang lain. */
export const cancelMeetingBookingSchema = z.object({
  reason: optionalField(textSchema("Alasan", { min: 3, max: 300 })),
});
export type CancelMeetingBookingInput = z.infer<typeof cancelMeetingBookingSchema>;

/** Form Admin membatalkan booking milik orang lain: alasan wajib (dikirim ke pemilik lewat email). */
export const adminCancelMeetingBookingSchema = z.object({
  reason: textSchema("Alasan pembatalan", { min: 3, max: 300 }),
});

/** Setting jam operasional ruang meeting (default 08:30–17:30). */
export const meetingHoursSchema = z
  .object({ start: slotTimeSchema, end: slotTimeSchema })
  .refine((v) => v.end > v.start, { path: ["end"], error: "Jam tutup harus setelah jam buka" });
export type MeetingHoursInput = z.infer<typeof meetingHoursSchema>;

export const meetingRoomActiveSchema = z.object({ roomId: z.string().min(1), isActive: z.boolean() });
