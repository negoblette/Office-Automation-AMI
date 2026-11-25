import { z } from "zod";
import { AssetCategory } from "@/generated/prisma/enums";
import { RACK_POSITION } from "@/lib/inventory";
import { isoDateSchema, optionalField, serialNumberSchema, textSchema } from "./common";

/** Maksimal unit (jumlah semua baris) dalam satu kali Daftarkan Unit / Terima Barang (2026-11-25). */
export const MAX_UNITS_PER_FORM = 50;

/**
 * Aset / demo unit (URD INV-01). Lokasi (2026-11-17): rak + posisi opsional tapi harus berpasangan; posisi ada di dalam
 * rak dicek di service. Kepemilikan TIDAK ada di form ini (2026-11-20): unit baru = milik AMI; unit principal /
 * distributor hanya lewat Penerimaan Barang (HAF), dan Ubah Unit tidak mengubah kepemilikan. Support & warranty dihapus
 * dari form (keputusan user 2026-11-20, "tidak diperlukan saat ini"): kolom database tetap ada, nilai lama tidak diubah.
 * Serial number boleh kosong (2026-11-25, permintaan user); bila diisi tetap UPPERCASE & unik (dicek di service).
 */
export const assetSchema = z
  .object({
    deviceName: textSchema("Nama perangkat", { min: 2, max: 150 }),
    serialNo: optionalField(serialNumberSchema),
    category: z.enum(AssetCategory, { error: "Kategori wajib dipilih" }),
    notes: optionalField(textSchema("Catatan", { max: 500 })),
    rackId: optionalField(z.string().min(1)),
    rackPosition: optionalField(z.string().trim().toUpperCase().regex(RACK_POSITION, { error: "Posisi tidak valid (contoh: A1)" })),
  })
  .superRefine((data, ctx) => {
    if (data.rackId && !data.rackPosition) ctx.addIssue({ code: "custom", path: ["rackPosition"], message: "Posisi di rak wajib dipilih" });
    if (data.rackPosition && !data.rackId) ctx.addIssue({ code: "custom", path: ["rackId"], message: "Rak wajib dipilih" });
  });
export type AssetInput = z.infer<typeof assetSchema>;

/** Isian serial number berbaris → daftar UPPERCASE. Satu per baris; koma, titik koma & tab juga pemisah (tempel dari Excel). */
export function splitSerials(text: string): string[] {
  return text
    .split(/[\r\n,;\t]+/)
    .map((serial) => serial.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Satu baris di Daftarkan Unit & Terima Barang (2026-11-25, permintaan user): `quantity` unit sejenis sekaligus — tiap unit
 * tetap baris `Asset` sendiri. Serial number opsional, boleh beberapa (`serials`, tidak lebih banyak dari jumlah); unit
 * sisanya tanpa S/N. Dobel dengan unit terdaftar dicek di service.
 */
export const unitRowSchema = z
  .object({
    deviceName: textSchema("Part number / deskripsi", { min: 2, max: 150 }),
    // Draft lama tanpa jumlah → 1.
    quantity: z.preprocess(
      (value) => (value === undefined ? 1 : value),
      z.coerce
        .number({ error: "Jumlah wajib diisi" })
        .int({ error: "Jumlah harus bilangan bulat" })
        .min(1, { error: "Jumlah minimal 1" })
        .max(MAX_UNITS_PER_FORM, { error: `Jumlah maksimal ${MAX_UNITS_PER_FORM}` }),
    ),
    serials: z.preprocess((value) => (typeof value === "string" ? splitSerials(value) : (value ?? [])), z.array(z.string())),
    category: z.enum(AssetCategory, { error: "Kategori wajib dipilih" }),
    notes: optionalField(textSchema("Catatan", { max: 500 })),
    rackId: optionalField(z.string().min(1)),
    rackPosition: optionalField(z.string().trim().toUpperCase().regex(RACK_POSITION, { error: "Posisi tidak valid (contoh: A1)" })),
  })
  .superRefine((row, ctx) => {
    if (row.rackId && !row.rackPosition) ctx.addIssue({ code: "custom", path: ["rackPosition"], message: "Posisi di rak wajib dipilih" });
    if (row.rackPosition && !row.rackId) ctx.addIssue({ code: "custom", path: ["rackId"], message: "Rak wajib dipilih" });
    const serialIssue = (message: string) => ctx.addIssue({ code: "custom", path: ["serials"], message });
    const badLength = row.serials.find((serial) => serial.length < 3 || serial.length > 50);
    const repeated = row.serials.find((serial, index) => row.serials.indexOf(serial) !== index);
    if (badLength) serialIssue(`Serial number ${badLength} harus 3–50 karakter`);
    else if (repeated) serialIssue(`Serial number ${repeated} ditulis dua kali`);
    else if (row.serials.length > row.quantity) {
      serialIssue(`Ada ${row.serials.length} serial number, lebih banyak dari jumlah (${row.quantity}). Naikkan jumlah atau kurangi serial number.`);
    }
  });
export type UnitRowInput = z.infer<typeof unitRowSchema>;

/** Baris-baris unit: minimal 1 baris, total unit ≤ `MAX_UNITS_PER_FORM`, serial number tidak boleh dobel antarbaris. */
export function unitRowsSchema(maxMessage: string) {
  return z
    .array(unitRowSchema)
    .min(1, { error: "Tambahkan minimal 1 unit" })
    .superRefine((rows, ctx) => {
      const total = rows.reduce((sum, row) => sum + row.quantity, 0);
      if (total > MAX_UNITS_PER_FORM) ctx.addIssue({ code: "custom", message: `${maxMessage} — sekarang ${total} unit` });
      const seen = new Map<string, number>();
      rows.forEach((row, index) => {
        const duplicate = row.serials.find((serial) => (seen.get(serial) ?? index) !== index);
        if (duplicate) ctx.addIssue({ code: "custom", path: [index, "serials"], message: `Serial number ${duplicate} sudah ada di baris ${seen.get(duplicate)! + 1}` });
        for (const serial of row.serials) if (!seen.has(serial)) seen.set(serial, index);
      });
    });
}

/** Baris → unit satu per satu (urutan dipertahankan): serial number dipakai berurutan, sisa unit tanpa S/N. */
export function expandUnitRows(rows: UnitRowInput[]): { rowIndex: number; unit: AssetInput }[] {
  return rows.flatMap((row, rowIndex) =>
    Array.from({ length: row.quantity }, (_, index) => ({
      rowIndex,
      unit: {
        deviceName: row.deviceName,
        serialNo: row.serials[index] ?? null,
        category: row.category,
        notes: row.notes,
        rackId: row.rackId,
        rackPosition: row.rackId ? row.rackPosition : null,
      },
    })),
  );
}

/** Daftarkan Unit (2026-11-25, permintaan user): beberapa unit milik AMI sekaligus, per baris boleh beberapa unit sejenis. */
export const assetBatchSchema = z.object({ units: unitRowsSchema(`Maksimal ${MAX_UNITS_PER_FORM} unit sekali daftar`) });
export type AssetBatchInput = z.infer<typeof assetBatchSchema>;

/** Serah terima ke karyawan (INV-02). */
export const assignAssetSchema = z.object({
  employeeId: z.string({ error: "Karyawan wajib dipilih" }).min(1, { error: "Karyawan wajib dipilih" }),
  assignedAt: isoDateSchema,
  note: optionalField(textSchema("Catatan", { max: 300 })),
});
export type AssignAssetInput = z.infer<typeof assignAssetSchema>;

/** Pengembalian (INV-02). */
export const returnAssetSchema = z.object({
  returnedAt: isoDateSchema,
  note: optionalField(textSchema("Catatan", { max: 300 })),
});
export type ReturnAssetInput = z.infer<typeof returnAssetSchema>;
