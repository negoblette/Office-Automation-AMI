// Masukan peminjaman unit demo / Product Trial Form (Fase 16, 2026-11-17).
import { z } from "zod";
import { LoanPurpose } from "@/generated/prisma/enums";
import { MAX_LOAN_ITEMS, maxLoanEnd } from "@/lib/demo-loan";
import { emailSchema, isoDateSchema, optionalField, textSchema } from "./common";

const requiredId = (message: string) => z.string({ error: message }).min(1, { error: message });

/**
 * Form pengajuan (Engineer / Sales): kegunaan (Backup Unit / POC), unit, peminjam (nama Customer atau diketik), PIC +
 * email, Sales Person, tanggal mulai & tanggal selesai (lamanya dihitung), keperluan. Ketersediaan unit & Sales Person
 * dicek di service.
 */
export const demoLoanSchema = z
  .object({
    purpose: z.enum(LoanPurpose, { error: "Pilih kegunaan peminjaman" }),
    /** Wajib bila kegunaan "Lainnya" (2026-11-17); diabaikan untuk Backup Unit / POC. */
    purposeDetail: optionalField(textSchema("Detail kegunaan", { min: 3, max: 200 })),
    assetIds: z
      .array(z.string().min(1))
      .min(1, { error: "Pilih minimal 1 unit" })
      .max(MAX_LOAN_ITEMS, { error: `Maksimal ${MAX_LOAN_ITEMS} unit dalam satu form` })
      .refine((ids) => new Set(ids).size === ids.length, { error: "Ada unit yang terpilih dua kali" }),
    borrowerName: textSchema("Perusahaan peminjam", { min: 2, max: 150 }),
    picName: textSchema("Nama PIC", { min: 2, max: 100 }),
    picEmail: emailSchema,
    salesPersonId: requiredId("Sales Person wajib dipilih"),
    startDate: isoDateSchema,
    /** Tanggal selesai = hari terakhir pinjam (inklusif) = jatuh tempo; lamanya dihitung dari kedua tanggal. */
    dueDate: isoDateSchema,
    remarks: optionalField(textSchema("Keperluan", { max: 500 })),
  })
  .superRefine((data, ctx) => {
    if (data.purpose === "OTHER" && !data.purposeDetail) {
      ctx.addIssue({ code: "custom", path: ["purposeDetail"], message: "Tulis detail kegunaannya" });
    }
    if (data.dueDate < data.startDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Tanggal selesai tidak boleh sebelum tanggal mulai" });
    } else if (data.dueDate > maxLoanEnd(data.startDate)) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Jangka pinjam maksimal 2 tahun" });
    }
  });
export type DemoLoanInput = z.infer<typeof demoLoanSchema>;

/** Operational menyiapkan barang: pilih pengantar (Item Sender). */
export const itemSenderSchema = z.object({
  itemSenderId: requiredId("Item Sender wajib dipilih"),
});
export type ItemSenderInput = z.infer<typeof itemSenderSchema>;

/** Operational menandai barang sudah diantar: tanggal (tidak di masa depan, dicek service) & nama penerima (opsional). */
export const deliverDemoLoanSchema = z.object({
  deliveredAt: isoDateSchema,
  receivedByName: optionalField(textSchema("Nama penerima", { min: 2, max: 100 })),
});
export type DeliverDemoLoanInput = z.infer<typeof deliverDemoLoanSchema>;

/** Setting (Admin): nomor terakhir Product Trial Form tahun ini — nomor berikutnya = nilai ini + 1. */
export const trialFormCounterSchema = z.object({
  lastNumber: z.coerce
    .number({ error: "Nomor wajib angka" })
    .int({ error: "Nomor harus bilangan bulat" })
    .min(0, { error: "Nomor minimal 0" })
    .max(9999, { error: "Nomor maksimal 9999" }),
});
export type TrialFormCounterInput = z.infer<typeof trialFormCounterSchema>;
