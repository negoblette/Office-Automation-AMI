import { z } from "zod";
import { CandidateStatus } from "@/generated/prisma/enums";
import { emailSchema, nikSchema, optionalField, personNameSchema, phoneSchema, textSchema } from "./common";
import { employeeCreateSchema } from "./employee";

/** Data kandidat (URD CAN-01, CAN-02). */
export const candidateSchema = z.object({
  fullName: personNameSchema,
  email: emailSchema,
  phone: optionalField(phoneSchema),
  nik: optionalField(nikSchema),
  appliedPosition: textSchema("Posisi dilamar", { min: 2, max: 100 }),
  status: z.enum(CandidateStatus, { error: "Status wajib dipilih" }),
  notes: optionalField(textSchema("Catatan", { max: 1000 })),
});
export type CandidateInput = z.infer<typeof candidateSchema>;

/**
 * Konversi kandidat Diterima → karyawan (CAN-03). Nama & email diambil dari data kandidat;
 * Admin hanya melengkapi data akun (divisi, jabatan, tanggal masuk, role, password awal).
 */
export const convertCandidateSchema = employeeCreateSchema.omit({ fullName: true, email: true });
export type ConvertCandidateInput = z.infer<typeof convertCandidateSchema>;
