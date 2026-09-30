// Kelengkapan dokumen karyawan (URD DOC-01..03). Aturan wajib: keputusan user 2026-09-24.
import type { DocumentType, FamilyRelation, MaritalStatus } from "@/generated/prisma/enums";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";

/** Dokumen pribadi yang wajib untuk semua karyawan (DOC-01). */
export const PERSONAL_DOCUMENT_TYPES = [
  "KTP",
  "KK",
  "NPWP",
  "PAS_FOTO",
  "SIM",
  "BPJS_TK",
  "BPJS_KES",
  "IJAZAH_TRANSKRIP",
  "SKCK",
] as const satisfies readonly DocumentType[];

/**
 * 12 jenis dokumen dibagi dua kelompok (v1.14, keputusan user 2026-09-29). Kelompok II juga
 * memuat dokumen keluarga (surat nikah/cerai, KTP pasangan, akte anak) yang dikelola di bagian Keluarga.
 */
export const DOCUMENT_GROUP_I = ["KTP", "KK", "NPWP", "PAS_FOTO", "BPJS_TK", "BPJS_KES"] as const satisfies readonly DocumentType[];
export const DOCUMENT_GROUP_II = [
  "IJAZAH_TRANSKRIP",
  "SKCK",
  "SIM",
  "SURAT_NIKAH_CERAI",
  "KTP_PASANGAN",
  "AKTE_KELAHIRAN_ANAK",
] as const satisfies readonly DocumentType[];
/** Dokumen Kelompok II milik karyawan sendiri (bukan dokumen keluarga). */
export const PERSONAL_GROUP_II = ["IJAZAH_TRANSKRIP", "SKCK", "SIM"] as const satisfies readonly DocumentType[];

/** Jenis dokumen milik anggota keluarga (bukan milik karyawan langsung). */
export const FAMILY_DOCUMENT_TYPE: Record<FamilyRelation, DocumentType> = {
  SPOUSE: "KTP_PASANGAN",
  CHILD: "AKTE_KELAHIRAN_ANAK",
};

/** Bagian Keluarga relevan untuk semua status selain belum menikah (DOC-02). */
export function hasFamilySection(maritalStatus: MaritalStatus): boolean {
  return maritalStatus !== "SINGLE";
}

export type DocumentCompletenessInput = {
  maritalStatus: MaritalStatus;
  /** Dokumen milik karyawan (tanpa familyMemberId). */
  documents: { docType: DocumentType }[];
  family: { id: string; relation: FamilyRelation; fullName: string; documents: { docType: DocumentType }[] }[];
};

export type DocumentCompleteness = {
  filled: number;
  total: number;
  percent: number;
  missing: string[];
};

/**
 * Wajib: 9 dokumen pribadi. Jika sudah pernah menikah: surat nikah/cerai. Jika MARRIED:
 * data pasangan + KTP pasangan. Setiap anak yang didaftarkan: akte kelahiran.
 */
export function documentCompleteness(input: DocumentCompletenessInput): DocumentCompleteness {
  const own = new Set(input.documents.map((doc) => doc.docType));
  const requirements: { label: string; met: boolean }[] = PERSONAL_DOCUMENT_TYPES.map((type) => ({
    label: DOCUMENT_TYPE_LABEL[type],
    met: own.has(type),
  }));

  if (hasFamilySection(input.maritalStatus)) {
    requirements.push({ label: DOCUMENT_TYPE_LABEL.SURAT_NIKAH_CERAI, met: own.has("SURAT_NIKAH_CERAI") });
  }
  if (input.maritalStatus === "MARRIED") {
    const spouse = input.family.find((member) => member.relation === "SPOUSE");
    requirements.push({
      label: spouse ? DOCUMENT_TYPE_LABEL.KTP_PASANGAN : "Data & KTP Suami / Istri",
      met: Boolean(spouse?.documents.some((doc) => doc.docType === "KTP_PASANGAN")),
    });
  }
  if (hasFamilySection(input.maritalStatus)) {
    for (const child of input.family.filter((member) => member.relation === "CHILD")) {
      requirements.push({
        label: `Akte Kelahiran ${child.fullName}`,
        met: child.documents.some((doc) => doc.docType === "AKTE_KELAHIRAN_ANAK"),
      });
    }
  }

  const filled = requirements.filter((r) => r.met).length;
  return {
    filled,
    total: requirements.length,
    percent: Math.round((filled / requirements.length) * 100),
    missing: requirements.filter((r) => !r.met).map((r) => r.label),
  };
}
