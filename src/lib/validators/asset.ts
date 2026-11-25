import { z } from "zod";
import { AssetCategory } from "@/generated/prisma/enums";
import { RACK_POSITION } from "@/lib/inventory";
import { isoDateSchema, optionalField, serialNumberSchema, textSchema } from "./common";

/** Maksimal baris unit dalam satu kali Daftarkan Unit (2026-11-25). */
export const MAX_ASSET_BATCH = 50;

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

/** Serial number yang diisi tidak boleh dobel antarbaris form (baris tanpa S/N dilewati). Dobel dengan unit terdaftar dicek di service. */
export function refineUniqueSerials(units: { serialNo: string | null }[], ctx: z.RefinementCtx) {
  const seen = new Map<string, number>();
  units.forEach((unit, index) => {
    if (!unit.serialNo) return;
    const first = seen.get(unit.serialNo);
    if (first !== undefined) ctx.addIssue({ code: "custom", path: [index, "serialNo"], message: `Serial number sama dengan baris ${first + 1}` });
    else seen.set(unit.serialNo, index);
  });
}

/** Daftarkan Unit (2026-11-25, permintaan user): beberapa unit milik AMI sekaligus, satu baris per unit. */
export const assetBatchSchema = z.object({
  units: z
    .array(assetSchema)
    .min(1, { error: "Tambahkan minimal 1 unit" })
    .max(MAX_ASSET_BATCH, { error: `Maksimal ${MAX_ASSET_BATCH} unit sekali daftar` })
    .superRefine(refineUniqueSerials),
});
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
