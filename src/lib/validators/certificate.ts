import { z } from "zod";
import { CertificateType } from "@/generated/prisma/enums";
import { isoDateSchema, optionalField, textSchema, withDateRange } from "./common";

/**
 * Sertifikat profesional / ijazah (URD CERT-01). Fase 14: masa berlaku wajib untuk sertifikat
 * profesional; ijazah tidak punya masa berlaku. `startDate` = tanggal diambil/lulus.
 */
export const certificateSchema = withDateRange(
  z.object({
    type: z.enum(CertificateType, { error: "Jenis wajib dipilih" }),
    name: textSchema("Nama sertifikat", { min: 2, max: 150 }),
    issuer: optionalField(textSchema("Penerbit", { max: 150 })),
    number: optionalField(textSchema("Nomor sertifikat", { max: 100 })),
    startDate: isoDateSchema,
    endDate: optionalField(isoDateSchema),
    fileKey: optionalField(z.string()),
  }),
  "startDate",
  "endDate",
  "Tanggal berakhir tidak boleh sebelum tanggal diambil",
).superRefine((v, ctx) => {
  if (v.type === "PROFESSIONAL" && !v.endDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "Masa berlaku wajib diisi untuk sertifikat profesional" });
  }
});
export type CertificateInput = z.infer<typeof certificateSchema>;
