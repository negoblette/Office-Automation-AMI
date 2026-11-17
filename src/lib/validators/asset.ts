import { z } from "zod";
import { AssetCategory, AssetOwnership } from "@/generated/prisma/enums";
import { RACK_POSITION } from "@/lib/inventory";
import { isoDateSchema, optionalField, serialNumberSchema, textSchema } from "./common";

/**
 * Aset / demo unit (URD INV-01). Periode support & warranty opsional, end ≥ start. Lokasi (2026-11-17): rak + posisi
 * opsional tapi harus berpasangan; posisi ada di dalam rak dicek di service.
 */
export const assetSchema = z
  .object({
    deviceName: textSchema("Nama perangkat", { min: 2, max: 150 }),
    serialNo: serialNumberSchema,
    category: z.enum(AssetCategory, { error: "Kategori wajib dipilih" }),
    supportStart: optionalField(isoDateSchema),
    supportEnd: optionalField(isoDateSchema),
    warrantyStart: optionalField(isoDateSchema),
    warrantyEnd: optionalField(isoDateSchema),
    warrantyNote: optionalField(textSchema("Catatan warranty", { max: 300 })),
    notes: optionalField(textSchema("Catatan", { max: 500 })),
    /** Kepemilikan (2026-11-17): bawaan milik AMI; principal / distributor wajib diisi namanya. */
    ownership: z.enum(AssetOwnership, { error: "Kepemilikan wajib dipilih" }).default("AMI"),
    ownerName: optionalField(textSchema("Nama principal / distributor", { min: 2, max: 100 })),
    rackId: optionalField(z.string().min(1)),
    rackPosition: optionalField(z.string().trim().toUpperCase().regex(RACK_POSITION, { error: "Posisi tidak valid (contoh: A1)" })),
  })
  .superRefine((data, ctx) => {
    for (const [start, end, label] of [
      ["supportStart", "supportEnd", "support"],
      ["warrantyStart", "warrantyEnd", "warranty"],
    ] as const) {
      if (data[start] && data[end] && data[end] < data[start]) {
        ctx.addIssue({ code: "custom", path: [end], message: `Akhir ${label} tidak boleh sebelum awalnya` });
      }
    }
    if (data.ownership !== "AMI" && !data.ownerName) {
      ctx.addIssue({ code: "custom", path: ["ownerName"], message: `Nama ${data.ownership === "PRINCIPAL" ? "principal" : "distributor"} wajib diisi` });
    }
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
