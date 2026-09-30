import { z } from "zod";
import { AssetCategory } from "@/generated/prisma/enums";
import { isoDateSchema, optionalField, serialNumberSchema, textSchema } from "./common";

/** Aset / demo unit (URD INV-01). Periode support & warranty opsional, end ≥ start. */
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
