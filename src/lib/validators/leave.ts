import { z } from "zod";
import { isoDateSchema, textSchema, withDateRange } from "./common";

/** Pengajuan cuti (LV-05..08). */
export const leaveRequestSchema = withDateRange(
  z.object({
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
