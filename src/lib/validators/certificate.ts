import { z } from "zod";
import { isoDateSchema, optionalField, textSchema } from "./common";

/** Level sertifikat profesional (2026-10-12: menggantikan kolom Nomor). */
export const CERTIFICATE_LEVELS = ["1", "2", "3"] as const;

/**
 * Sertifikat profesional (URD CERT-01). Keputusan user 2026-10-12: Nama, Penerbit, **Level** (1–3), Tanggal diambil,
 * **Masa berlaku wajib** kecuali dicentang "Tidak ada masa berlaku / Permanent" (`noExpiry`).
 * 2026-11-02: ijazah tidak lagi dicatat sebagai sertifikat — diunggah di Dokumen ("Ijazah + Transkrip").
 */
export const IJAZAH_MOVED_MESSAGE = "Ijazah diunggah di Profil → Dokumen & Keluarga (Ijazah + Transkrip)";

export const certificateSchema = z
  .object({
    type: z.literal("PROFESSIONAL", { error: IJAZAH_MOVED_MESSAGE }).default("PROFESSIONAL"),
    name: textSchema("Nama", { min: 2, max: 150 }),
    issuer: optionalField(textSchema("Penerbit", { max: 150 })),
    // Terima "1" (form) maupun 1 (hasil parse sebelumnya) — schema aman di-parse ulang di server.
    level: optionalField(z.union([z.enum(CERTIFICATE_LEVELS), z.number().int().min(1).max(3).transform((n) => String(n) as (typeof CERTIFICATE_LEVELS)[number])], { error: "Level tidak valid" })),
    startDate: optionalField(isoDateSchema),
    endDate: optionalField(isoDateSchema),
    noExpiry: z.boolean().default(false),
    fileKey: optionalField(z.string()),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (!v.level) issue("level", "Level wajib dipilih");
    if (!v.startDate) issue("startDate", "Tanggal diambil wajib diisi");
    if (!v.noExpiry && !v.endDate) issue("endDate", "Masa berlaku wajib diisi, atau centang \"Tidak ada masa berlaku / Permanent\"");
    if (!v.noExpiry && v.endDate && v.startDate && v.endDate < v.startDate) issue("endDate", "Tanggal berakhir tidak boleh sebelum tanggal diambil");
  })
  .transform((v) => ({
    type: v.type,
    name: v.name,
    issuer: v.issuer,
    level: v.level ? Number(v.level) : null,
    degree: null,
    startDate: v.startDate as string,
    endDate: v.noExpiry ? null : v.endDate,
    noExpiry: v.noExpiry,
    graduationDate: null,
    fileKey: v.fileKey,
  }));
export type CertificateInput = z.output<typeof certificateSchema>;
