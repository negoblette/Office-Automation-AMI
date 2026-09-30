import { describe, expect, it } from "vitest";
import { DocumentType } from "@/generated/prisma/enums";
import { DOCUMENT_GROUP_I, DOCUMENT_GROUP_II, documentCompleteness, PERSONAL_DOCUMENT_TYPES } from "@/lib/employee-documents";

const allPersonal = PERSONAL_DOCUMENT_TYPES.map((docType) => ({ docType }));

describe("documentCompleteness (DOC-03)", () => {
  it("belum menikah: hanya 9 dokumen pribadi", () => {
    expect(documentCompleteness({ maritalStatus: "SINGLE", documents: [], family: [] })).toMatchObject({
      filled: 0,
      total: 9,
      percent: 0,
    });
    expect(documentCompleteness({ maritalStatus: "SINGLE", documents: allPersonal, family: [] })).toMatchObject({
      filled: 9,
      total: 9,
      percent: 100,
      missing: [],
    });
  });

  it("dokumen ganda tidak dihitung dua kali; SIM ikut wajib", () => {
    const result = documentCompleteness({
      maritalStatus: "SINGLE",
      documents: [{ docType: "KTP" }, { docType: "KTP" }, { docType: "KK" }],
      family: [],
    });
    expect(result.filled).toBe(2);
    expect(result.missing).toContain("SIM A/C");
  });

  it("menikah tanpa data pasangan → wajib surat nikah & data + KTP pasangan", () => {
    const result = documentCompleteness({ maritalStatus: "MARRIED", documents: allPersonal, family: [] });
    expect(result).toMatchObject({ filled: 9, total: 11 });
    expect(result.missing).toEqual(["Surat Nikah / Cerai", "Data & KTP Suami / Istri"]);
  });

  it("menikah dengan pasangan & 2 anak → akte per anak", () => {
    const result = documentCompleteness({
      maritalStatus: "MARRIED",
      documents: [...allPersonal, { docType: "SURAT_NIKAH_CERAI" }],
      family: [
        { id: "s", relation: "SPOUSE", fullName: "Rina", documents: [{ docType: "KTP_PASANGAN" }] },
        { id: "c1", relation: "CHILD", fullName: "Budi", documents: [{ docType: "AKTE_KELAHIRAN_ANAK" }] },
        { id: "c2", relation: "CHILD", fullName: "Sari", documents: [] },
      ],
    });
    expect(result).toMatchObject({ filled: 12, total: 13 });
    expect(result.missing).toEqual(["Akte Kelahiran Sari"]);
  });

  it("cerai: surat nikah/cerai & akte anak wajib, KTP pasangan tidak", () => {
    const result = documentCompleteness({
      maritalStatus: "DIVORCED",
      documents: allPersonal,
      family: [{ id: "c1", relation: "CHILD", fullName: "Budi", documents: [] }],
    });
    expect(result.missing).toEqual(["Surat Nikah / Cerai", "Akte Kelahiran Budi"]);
  });
});

describe("kelompok dokumen (v1.14)", () => {
  it("12 jenis dokumen terbagi habis ke Kelompok I & II tanpa tumpang tindih", () => {
    const all = [...DOCUMENT_GROUP_I, ...DOCUMENT_GROUP_II];
    expect(all).toHaveLength(12);
    expect(new Set(all).size).toBe(12);
    expect(new Set(all)).toEqual(new Set(Object.values(DocumentType).filter((t) => t !== "OTHER")));
  });
});
