import { z } from "zod";
import { amountSchema, isoDateSchema, optionalField, textSchema } from "./common";

export const healthClaimItemSchema = z.object({
  categoryId: z.string({ error: "Kategori wajib dipilih" }).min(1, { error: "Kategori wajib dipilih" }),
  date: isoDateSchema,
  amount: amountSchema,
  note: optionalField(textSchema("Keterangan", { max: 300 })),
});

/**
 * Klaim kesehatan (HC-02, HC-03; 2026-11-06: beberapa baris seperti reimburse, tanpa kunjungan). Plafon per tahun →
 * semua baris wajib di tahun yang sama. Upload invoice dihapus (Fase 14).
 */
export const healthClaimSchema = z
  .object({
    items: z.array(healthClaimItemSchema).min(1, { error: "Minimal 1 baris" }).max(50, { error: "Maksimal 50 baris per klaim" }),
    note: optionalField(textSchema("Catatan", { max: 500 })),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.items.map((item) => item.date.slice(0, 4))).size > 1) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "Semua baris harus di tahun yang sama. Pisahkan klaim untuk tahun yang berbeda." });
    }
  });
export type HealthClaimInput = z.infer<typeof healthClaimSchema>;

/** Plafon tahunan per karyawan per tahun (HC-01, SET-04). */
export const healthPlafondSchema = z.object({
  employeeId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  annualAmount: amountSchema,
});
export type HealthPlafondInput = z.infer<typeof healthPlafondSchema>;
