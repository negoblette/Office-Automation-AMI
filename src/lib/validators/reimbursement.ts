// Reimburse — URD RMB-02..05, Tech Spec §6.4. Schema yang sama untuk simpan draft & ajukan;
// aturan tambahan saat ajukan (min 1 baris, kwitansi wajib ada filenya) dicek di service.
import { z } from "zod";
import { PaymentMethod } from "@/generated/prisma/enums";
import { amountSchema, isoDateSchema, optionalField, textSchema } from "./common";

export const reimbursementItemSchema = z.object({
  date: isoDateSchema,
  /** Nama Company/Customer: dipilih dari master atau diketik baru (otomatis ditambahkan). */
  customerName: optionalField(textSchema("Company", { max: 150 })),
  projectId: optionalField(z.string()),
  activity: textSchema("Aktivitas / project", { min: 2, max: 300 }),
  participants: textSchema("Nama – jabatan", { min: 2, max: 500 }),
  location: textSchema("Lokasi", { min: 2, max: 150 }),
  typeId: z.string({ error: "Tipe wajib dipilih" }).min(1, { error: "Tipe wajib dipilih" }),
  hasReceipt: z.boolean(),
  paymentMethod: z.enum(PaymentMethod, { error: "Pembayaran wajib dipilih" }),
  amount: amountSchema,
  receiptFileKey: optionalField(z.string()),
  receiptFileName: optionalField(textSchema("Nama file", { max: 200 })),
});
export type ReimbursementItemInput = z.infer<typeof reimbursementItemSchema>;

export const reimbursementSchema = z.object({
  note: optionalField(textSchema("Catatan", { max: 500 })),
  items: z.array(reimbursementItemSchema).max(50, { error: "Maksimal 50 baris per pengajuan" }),
});
export type ReimbursementInput = z.infer<typeof reimbursementSchema>;

/** Subtotal Cash / CC / Total (RMB-06). Dipakai client (tampilan) & server (nilai yang disimpan). */
export function reimbursementTotals(items: { paymentMethod: PaymentMethod | string; amount: number | null | undefined }[]) {
  let cash = 0;
  let cc = 0;
  for (const item of items) {
    const amount = Number.isFinite(item.amount) ? Number(item.amount) : 0;
    if (item.paymentMethod === "CC") cc += amount;
    else cash += amount;
  }
  return { cash, cc, total: cash + cc };
}
