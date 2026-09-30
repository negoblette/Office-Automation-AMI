import { z } from "zod";
import { amountSchema, isoDateSchema, optionalField, textSchema } from "./common";

/** Klaim kesehatan (HC-02, HC-03): kategori, tanggal, nominal, invoice wajib. */
export const healthClaimSchema = z.object({
  categoryId: z.string({ error: "Kategori wajib dipilih" }).min(1, { error: "Kategori wajib dipilih" }),
  claimDate: isoDateSchema,
  amount: amountSchema,
  invoiceFileKey: z.string({ error: "Invoice wajib di-upload" }).min(1, { error: "Invoice wajib di-upload" }),
  invoiceFileName: textSchema("Nama file", { max: 200 }),
  note: optionalField(textSchema("Catatan", { max: 500 })),
});
export type HealthClaimInput = z.infer<typeof healthClaimSchema>;

/** Plafon tahunan per karyawan per tahun (HC-01, SET-04). */
export const healthPlafondSchema = z.object({
  employeeId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  annualAmount: amountSchema,
});
export type HealthPlafondInput = z.infer<typeof healthPlafondSchema>;
