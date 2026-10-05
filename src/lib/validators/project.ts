import { z } from "zod";
import { Division, PaymentMethod, ProjectType } from "@/generated/prisma/enums";
import { amountSchema, isoDateSchema, textSchema } from "./common";

/** Master Customer (PRJ-01). */
export const customerSchema = z.object({ name: textSchema("Nama customer", { min: 2, max: 150 }) });

/** Master Project (PRJ-01): Berjalan / New Acquisition. */
export const projectSchema = z.object({
  customerId: z.string({ error: "Customer wajib dipilih" }).min(1, { error: "Customer wajib dipilih" }),
  /** ID project (Fase 14), mis. PRJ-0012 — unik, huruf besar. */
  code: textSchema("ID project", { min: 2, max: 30 })
    .toUpperCase()
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]*$/, { error: "ID hanya huruf, angka, titik, garis miring, atau strip" })),
  name: textSchema("Nama project", { min: 2, max: 150 }),
  type: z.enum(ProjectType, { error: "Jenis wajib dipilih" }),
  isActive: z.boolean(),
});
export type ProjectInput = z.infer<typeof projectSchema>;

/** Expense project (PRJ-02): kategori CC/Cash. */
export const projectExpenseSchema = z.object({
  date: isoDateSchema,
  description: textSchema("Keterangan", { min: 3, max: 300 }),
  paymentMethod: z.enum(PaymentMethod, { error: "Pembayaran wajib dipilih" }),
  amount: amountSchema,
});
export type ProjectExpenseInput = z.infer<typeof projectExpenseSchema>;

// TODO(OI-06): detail data revenue project ditunda — field minimal tanggal, deskripsi, nominal.
export const projectRevenueSchema = z.object({
  date: isoDateSchema,
  description: textSchema("Keterangan", { min: 3, max: 300 }),
  amount: amountSchema,
});
export type ProjectRevenueInput = z.infer<typeof projectRevenueSchema>;

/** Master tipe reimburse (SET-05): nama, divisi yang boleh memakai, aktif. */
export const reimburseTypeSchema = z.object({
  name: textSchema("Nama tipe", { min: 2, max: 80 }),
  divisions: z.array(z.enum(Division)).min(1, { error: "Pilih minimal satu divisi" }),
  isActive: z.boolean(),
});
export type ReimburseTypeInput = z.infer<typeof reimburseTypeSchema>;

/** Master kategori klaim kesehatan (SET-05). */
export const healthCategorySchema = z.object({
  name: textSchema("Nama kategori", { min: 2, max: 80 }),
  isActive: z.boolean(),
});
export type HealthCategoryInput = z.infer<typeof healthCategorySchema>;
