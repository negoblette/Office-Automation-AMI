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

/** Appeal tidak hadir (Fase 14): tanggal, alasan Sakit / Kunjungan keluar / Lainnya (2026-10-30), keterangan. */
export const appealSchema = z
  .object({
    date: isoDateSchema,
    /** Sampai tanggal (opsional, 2026-10-14) — satu appeal untuk beberapa hari berturut-turut. */
    endDate: optionalField(isoDateSchema),
    reason: z.enum(["SICK", "VISIT", "OTHER"], { error: "Alasan wajib dipilih" }),
    note: textSchema("Keterangan", { min: 3, max: 300 }),
    /** Bukti surat keterangan sakit — opsional untuk alasan Sakit (wajib 2026-10-14, opsional sejak 2026-11-03). */
    fileKey: optionalField(z.string()),
    fileName: optionalField(textSchema("Nama file", { max: 200 })),
  })
  .superRefine((v, ctx) => {
    if (v.endDate && v.endDate < v.date) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Tanggal akhir tidak boleh sebelum tanggal mulai" });
  });

/** Appeal dari daftar tanggal yang masih bisa di-appeal (2026-11-02): centang tanggalnya, satu alasan untuk semua. */
export const appealDatesSchema = z
  .object({
    dates: z.array(isoDateSchema).min(1, { error: "Pilih minimal 1 tanggal" }).max(31, { error: "Maksimal 31 tanggal" }),
    reason: z.enum(["SICK", "VISIT", "OTHER"], { error: "Alasan wajib dipilih" }),
    note: textSchema("Keterangan", { min: 3, max: 300 }),
    /** Surat keterangan sakit — opsional (2026-11-03). */
    fileKey: optionalField(z.string()),
    fileName: optionalField(textSchema("Nama file", { max: 200 })),
  });
