import { z } from "zod";
import { CertificateType, EducationLevel } from "@/generated/prisma/enums";
import { isoDateSchema, optionalField, textSchema } from "./common";

/** Level sertifikat profesional (2026-10-12: menggantikan kolom Nomor). */
export const CERTIFICATE_LEVELS = ["1", "2", "3"] as const;

/**
 * Sertifikat profesional / ijazah (URD CERT-01). Keputusan user 2026-10-12:
 * - Profesional: Nama, Penerbit, **Level** (1–3), Tanggal diambil, **Masa berlaku wajib** kecuali dicentang
 *   "Tidak ada masa berlaku / Permanent" (`noExpiry`).
 * - Ijazah: **Gelar** (`name`, bebas), **Lembaga** (`issuer`, bebas), **Jenjang** (`degree`), **Tanggal mulai**
 *   (`startDate`) & **Tanggal lulus** (`graduationDate`); tidak punya masa berlaku (tidak ikut pengingat).
 */
export const certificateSchema = z
  .object({
    type: z.enum(CertificateType, { error: "Jenis wajib dipilih" }),
    name: textSchema("Nama / gelar", { min: 2, max: 150 }),
    issuer: optionalField(textSchema("Penerbit / lembaga", { max: 150 })),
    // Terima "1" (form) maupun 1 (hasil parse sebelumnya) — schema aman di-parse ulang di server.
    level: optionalField(z.union([z.enum(CERTIFICATE_LEVELS), z.number().int().min(1).max(3).transform((n) => String(n) as (typeof CERTIFICATE_LEVELS)[number])], { error: "Level tidak valid" })),
    degree: optionalField(z.enum(EducationLevel, { error: "Jenjang tidak valid" })),
    startDate: isoDateSchema,
    endDate: optionalField(isoDateSchema),
    noExpiry: z.boolean().default(false),
    graduationDate: optionalField(isoDateSchema),
    fileKey: optionalField(z.string()),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (v.type === "PROFESSIONAL") {
      if (!v.level) issue("level", "Level wajib dipilih");
      if (!v.noExpiry && !v.endDate) issue("endDate", "Masa berlaku wajib diisi, atau centang \"Tidak ada masa berlaku / Permanent\"");
      if (!v.noExpiry && v.endDate && v.endDate < v.startDate) issue("endDate", "Tanggal berakhir tidak boleh sebelum tanggal diambil");
    } else {
      if (!v.issuer) issue("issuer", "Lembaga wajib diisi");
      if (!v.degree) issue("degree", "Jenjang wajib dipilih");
      if (!v.graduationDate) issue("graduationDate", "Tanggal lulus wajib diisi");
      else if (v.graduationDate < v.startDate) issue("graduationDate", "Tanggal lulus tidak boleh sebelum tanggal mulai");
    }
  })
  .transform((v) => {
    const professional = v.type === "PROFESSIONAL";
    return {
      type: v.type,
      name: v.name,
      issuer: v.issuer,
      level: professional && v.level ? Number(v.level) : null,
      degree: professional ? null : v.degree,
      startDate: v.startDate,
      endDate: professional && !v.noExpiry ? v.endDate : null,
      noExpiry: professional && v.noExpiry,
      graduationDate: professional ? null : v.graduationDate,
      fileKey: v.fileKey,
    };
  });
export type CertificateInput = z.output<typeof certificateSchema>;
