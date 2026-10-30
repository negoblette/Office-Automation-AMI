import { z } from "zod";
import type { Gender, LeaveType } from "@/generated/prisma/enums";
import { isoDateSchema, textSchema, withDateRange } from "./common";

/** Jenis cuti (2026-10-30). Urutan = urutan di dropdown form. */
export const LEAVE_TYPES = ["ANNUAL", "MATERNITY", "BEREAVEMENT"] as const satisfies readonly LeaveType[];

/** Jatah cuti melahirkan yang tidak memotong saldo, dalam hari kerja per pengajuan (2026-10-30). */
export const MATERNITY_FREE_DAYS: Record<Gender, number> = { MALE: 2, FEMALE: 90 };

/**
 * Hari kerja yang dipotong dari saldo menurut aturan: tahunan semua, kematian tidak ada, melahirkan hanya yang
 * melewati jatah gratis per jenis kelamin (mis. laki-laki 4 hari → 2 gratis, 2 potong saldo). Approver bisa mengubahnya.
 */
export function defaultDeductDays(type: LeaveType, workingDays: number, gender: Gender | null): number {
  if (type === "ANNUAL") return workingDays;
  if (type === "BEREAVEMENT") return 0;
  return Math.max(0, workingDays - (gender ? MATERNITY_FREE_DAYS[gender] : 0));
}

/** Pengajuan cuti (LV-05..08). */
export const leaveRequestSchema = withDateRange(
  z.object({
    type: z.enum(LEAVE_TYPES, { error: "Pilih jenis cuti" }).default("ANNUAL"),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    reason: textSchema("Alasan", { min: 3, max: 500 }),
  }),
  "startDate",
  "endDate",
  "Tanggal selesai tidak boleh sebelum tanggal mulai",
);
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

/** Hari libur (LV-04): nasional atau tambahan manual. */
export const holidaySchema = z.object({
  date: isoDateSchema,
  name: textSchema("Nama hari libur", { min: 2, max: 150 }),
  isNational: z.boolean(),
});
export type HolidayInput = z.infer<typeof holidaySchema>;

/** Impor banyak libur sekaligus: satu per baris "YYYY-MM-DD Nama libur". */
export const holidayImportSchema = z.object({
  text: z.string().trim().min(1, { error: "Isi daftar libur" }),
  isNational: z.boolean(),
});

/** Parse teks impor; mengembalikan baris valid dan nomor baris yang tidak valid. */
export function parseHolidayLines(text: string) {
  const holidays: { date: string; name: string }[] = [];
  const invalidLines: number[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const match = /^(\d{4}-\d{2}-\d{2})\s+(.{2,150})$/.exec(line);
    if (!match || !isoDateSchema.safeParse(match[1]).success) invalidLines.push(index + 1);
    else holidays.push({ date: match[1], name: match[2].trim() });
  });
  return { holidays, invalidLines };
}

/** Setting jatah cuti per masa kerja + batas carry over (LV-01, LV-03, SET-03). */
export const leavePolicySettingSchema = z
  .object({
    policies: z
      .array(
        z.object({
          minYears: z.coerce.number({ error: "Wajib angka" }).int().min(0),
          maxYears: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().min(0).nullable()),
          days: z.coerce.number({ error: "Wajib angka" }).int().min(0, { error: "Minimal 0" }).max(60, { error: "Maksimal 60" }),
        }),
      )
      .min(1),
    maxCarryOver: z.coerce.number({ error: "Wajib angka" }).int().min(0, { error: "Minimal 0" }).max(30, { error: "Maksimal 30" }),
  })
  .superRefine((data, ctx) => {
    // Rentang harus mulai dari 0, berurutan tanpa celah/tumpang tindih, dan yang terakhir tanpa batas atas.
    let expectedMin = 0;
    data.policies.forEach((policy, index) => {
      const last = index === data.policies.length - 1;
      if (policy.minYears !== expectedMin) {
        ctx.addIssue({ code: "custom", path: ["policies", index, "minYears"], message: `Harus ${expectedMin} (lanjutan baris sebelumnya)` });
      }
      if (last && policy.maxYears !== null) {
        ctx.addIssue({ code: "custom", path: ["policies", index, "maxYears"], message: "Baris terakhir harus tanpa batas atas (kosong)" });
      }
      if (!last && (policy.maxYears === null || policy.maxYears < policy.minYears)) {
        ctx.addIssue({ code: "custom", path: ["policies", index, "maxYears"], message: "Wajib diisi dan ≥ tahun minimal" });
      }
      expectedMin = (policy.maxYears ?? policy.minYears) + 1;
    });
  });
export type LeavePolicySettingInput = z.infer<typeof leavePolicySettingSchema>;

/** Pemutihan / penyesuaian saldo cuti oleh Admin (Fase 14): ± hari, alasan wajib. */
/**
 * Penyesuaian saldo cuti oleh Admin. `SET` (2026-10-28) = atur sisa cuti menjadi `days` (boleh minus; selisihnya dicatat
 * sebagai penyesuaian); `DELTA` = tambah (+) / kurangi (−) `days` hari.
 */
export const LEAVE_ADJUST_MODES = { SET: "Atur sisa cuti menjadi", DELTA: "Tambah / kurangi" } as const;
export const leaveAdjustmentSchema = z
  .object({
    mode: z.enum(["SET", "DELTA"]).default("DELTA"),
    days: z.coerce.number({ error: "Jumlah hari wajib diisi" }).int({ error: "Harus bilangan bulat" }),
    reason: textSchema("Alasan", { min: 3, max: 300 }),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", path: ["days"], message });
    if (v.mode === "DELTA" && v.days === 0) issue("Tidak boleh 0");
    if (v.mode === "DELTA" && Math.abs(v.days) > 30) issue("Maksimal 30 hari per penyesuaian");
    if (v.mode === "SET" && Math.abs(v.days) > 60) issue("Sisa cuti antara −60 dan 60 hari");
  });
export type LeaveAdjustmentFormInput = z.infer<typeof leaveAdjustmentSchema>;
