// Penerimaan barang principal / distributor (2026-11-20) — satu kedatangan = satu Hardware Admission Form, banyak unit.
import { z } from "zod";
import { AssetCategory } from "@/generated/prisma/enums";
import { MAX_LOAN_ITEMS } from "@/lib/demo-loan";
import { RACK_POSITION } from "@/lib/inventory";
import { refineUniqueSerials } from "./asset";
import { isoDateSchema, optionalField, serialNumberSchema, textSchema } from "./common";

const requiredId = (message: string) => z.string({ error: message }).min(1, { error: message });

/** Satu unit yang diterima: data dasar unit (support / warranty bisa dilengkapi lewat Ubah Unit). S/N boleh kosong (2026-11-25). */
export const receiptUnitSchema = z
  .object({
    deviceName: textSchema("Part number / deskripsi", { min: 2, max: 150 }),
    serialNo: optionalField(serialNumberSchema),
    category: z.enum(AssetCategory, { error: "Kategori wajib dipilih" }),
    rackId: optionalField(z.string().min(1)),
    rackPosition: optionalField(z.string().trim().toUpperCase().regex(RACK_POSITION, { error: "Posisi tidak valid (contoh: A1)" })),
    notes: optionalField(textSchema("Catatan", { max: 500 })),
  })
  .superRefine((unit, ctx) => {
    if (unit.rackId && !unit.rackPosition) ctx.addIssue({ code: "custom", path: ["rackPosition"], message: "Posisi di rak wajib dipilih" });
    if (unit.rackPosition && !unit.rackId) ctx.addIssue({ code: "custom", path: ["rackId"], message: "Rak wajib dipilih" });
  });

/**
 * Form Terima Barang (Operational): dari principal / distributor (nama), kontak (wajib), tanggal terima, PIC AMI
 * (Engineer / Sales), penerima AMI, pengirim (opsional), keperluan, lalu daftar unit (S/N opsional; yang diisi tidak boleh dobel di form;
 * dobel dengan unit terdaftar, PIC, penerima, rak & tanggal dicek di service).
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
  units: z
    .array(receiptUnitSchema)
    .min(1, { error: "Tambahkan minimal 1 unit" })
    .max(MAX_LOAN_ITEMS, { error: `Maksimal ${MAX_LOAN_ITEMS} unit dalam satu penerimaan` })
    .superRefine(refineUniqueSerials),
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
