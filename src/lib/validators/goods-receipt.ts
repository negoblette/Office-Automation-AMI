// Penerimaan barang principal / distributor (2026-11-20) — satu kedatangan = satu Hardware Admission Form, banyak unit.
import { z } from "zod";
import { MAX_LOAN_ITEMS } from "@/lib/demo-loan";
import { MAX_UNITS_PER_FORM, unitRowsSchema } from "./asset";
import { isoDateSchema, optionalField, textSchema } from "./common";

const requiredId = (message: string) => z.string({ error: message }).min(1, { error: message });

/**
 * Form Terima Barang (Operational): dari principal / distributor (nama), kontak (wajib), tanggal terima, PIC AMI
 * (Engineer / Sales), penerima AMI, pengirim (opsional), keperluan, lalu baris unit (`unitRowSchema`, 2026-11-25: jumlah
 * per baris + beberapa S/N opsional; yang diisi tidak boleh dobel di form; dobel dengan unit terdaftar, PIC, penerima, rak &
 * tanggal dicek di service). Support / warranty bisa dilengkapi lewat Ubah Unit.
 */
export const goodsReceiptSchema = z.object({
  ownership: z.enum(["PRINCIPAL", "DISTRIBUTOR"], { error: "Pilih principal atau distributor" }),
  ownerName: textSchema("Nama principal / distributor", { min: 2, max: 100 }),
  contactName: textSchema("Nama kontak", { min: 2, max: 100 }),
  receivedDate: isoDateSchema,
  picId: requiredId("PIC wajib dipilih"),
  receiverId: requiredId("Penerima wajib dipilih"),
  senderName: optionalField(textSchema("Nama pengirim", { min: 2, max: 100 })),
  purpose: optionalField(textSchema("Keperluan", { max: 500 })),
  units: unitRowsSchema(`Maksimal ${MAX_UNITS_PER_FORM} unit dalam satu penerimaan`),
});
export type GoodsReceiptInput = z.infer<typeof goodsReceiptSchema>;

/**
 * Kembalikan barang pinjaman ke principal / distributor (2026-11-20, Operational): pilih unit (boleh sebagian), tanggal,
 * kontak (up:), karyawan AMI yang menyerahkan (Returned By), penerima di principal (opsional), catatan. Unit harus milik
 * penerimaan itu & tidak sedang dipinjam — dicek di service.
 */
export const goodsReturnSchema = z.object({
  assetIds: z
    .array(z.string().min(1))
    .min(1, { error: "Pilih minimal 1 unit yang dikembalikan" })
    .max(MAX_LOAN_ITEMS, { error: `Maksimal ${MAX_LOAN_ITEMS} unit dalam satu pengembalian` })
    .refine((ids) => new Set(ids).size === ids.length, { error: "Ada unit yang terpilih dua kali" }),
  returnedDate: isoDateSchema,
  contactName: textSchema("Nama kontak", { min: 2, max: 100 }),
  returnedById: requiredId("Pilih karyawan yang menyerahkan"),
  receivedByName: optionalField(textSchema("Nama penerima", { min: 2, max: 100 })),
  note: optionalField(textSchema("Catatan", { max: 500 })),
});
export type GoodsReturnInput = z.infer<typeof goodsReturnSchema>;
