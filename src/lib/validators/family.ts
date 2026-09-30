import { z } from "zod";
import { DocumentType, FamilyRelation } from "@/generated/prisma/enums";
import { isoDateSchema, nikSchema, optionalField, personNameSchema, textSchema } from "./common";

/** Anggota keluarga (DOC-02): suami/istri atau anak. */
export const familyMemberSchema = z.object({
  relation: z.enum(FamilyRelation, { error: "Hubungan keluarga wajib dipilih" }),
  fullName: personNameSchema,
  nik: optionalField(nikSchema),
  birthDate: optionalField(isoDateSchema),
});
export type FamilyMemberInput = z.infer<typeof familyMemberSchema>;

/** Menautkan file yang sudah di-upload ke dokumen karyawan/keluarga. */
export const addDocumentSchema = z.object({
  employeeId: z.string().min(1),
  docType: z.enum(DocumentType, { error: "Jenis dokumen tidak valid" }),
  familyMemberId: z.string().min(1).nullish(),
  fileKey: z.string().min(1),
  fileName: textSchema("Nama file", { max: 200 }),
});
export type AddDocumentInput = z.infer<typeof addDocumentSchema>;
