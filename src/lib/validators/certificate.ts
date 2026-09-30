import { z } from "zod";
import { CertificateType } from "@/generated/prisma/enums";
import { isoDateSchema, optionalField, textSchema, withDateRange } from "./common";

/** Sertifikat profesional / ijazah (URD CERT-01). End date kosong = seumur hidup. */
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
  "Tanggal berakhir tidak boleh sebelum tanggal terbit",
);
export type CertificateInput = z.infer<typeof certificateSchema>;
