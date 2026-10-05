import { z } from "zod";
import { isoDateSchema, optionalField, textSchema } from "./common";

/** Jam `HH:MM` 24 jam (nilai input type="time"). */
export const timeSchema = z
  .string({ error: "Jam wajib diisi" })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Format jam HH:MM" });

/** Setting jam kerja: jam pulang harus setelah jam masuk. */
export const workHoursSchema = z
  .object({ workStart: timeSchema, workEnd: timeSchema })
  .refine((v) => v.workEnd > v.workStart, { path: ["workEnd"], error: "Jam pulang harus setelah jam masuk" });
export type WorkHoursInput = z.infer<typeof workHoursSchema>;

/** Koreksi absensi oleh Admin: jam masuk wajib, jam pulang boleh kosong, alasan wajib. */
export const attendanceCorrectionSchema = z
  .object({
    date: isoDateSchema,
    clockIn: timeSchema,
    clockOut: optionalField(timeSchema),
    note: textSchema("Alasan koreksi", { min: 3, max: 300 }),
  })
  .refine((v) => !v.clockOut || v.clockOut > v.clockIn, { path: ["clockOut"], error: "Jam pulang harus setelah jam masuk" });
export type AttendanceCorrectionInput = z.infer<typeof attendanceCorrectionSchema>;

/** Appeal tidak hadir (Fase 14): tanggal, alasan Sakit / Kunjungan keluar, keterangan. */
export const appealSchema = z.object({
  date: isoDateSchema,
  reason: z.enum(["SICK", "VISIT"], { error: "Alasan wajib dipilih" }),
  note: textSchema("Keterangan", { min: 3, max: 300 }),
});
export type AppealFormInput = z.infer<typeof appealSchema>;
