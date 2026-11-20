import { z } from "zod";
import { AssetCategory } from "@/generated/prisma/enums";
import { RACK_POSITION } from "@/lib/inventory";
import { isoDateSchema, optionalField, serialNumberSchema, textSchema } from "./common";

/**
 * Aset / demo unit (URD INV-01). Lokasi (2026-11-17): rak + posisi opsional tapi harus berpasangan; posisi ada di dalam
 * rak dicek di service. Kepemilikan TIDAK ada di form ini (2026-11-20): unit baru = milik AMI; unit principal /
 * distributor hanya lewat Penerimaan Barang (HAF), dan Ubah Unit tidak mengubah kepemilikan. Support & warranty dihapus
 * dari form (keputusan user 2026-11-20, "tidak diperlukan saat ini"): kolom database tetap ada, nilai lama tidak diubah.
 */
export const assetSchema = z
  .object({
    deviceName: textSchema("Nama perangkat", { min: 2, max: 150 }),
    serialNo: serialNumberSchema,
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
