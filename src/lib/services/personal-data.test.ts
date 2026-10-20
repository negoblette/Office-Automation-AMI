import { describe, expect, it } from "vitest";
import type { FamilyRelation } from "@/generated/prisma/enums";
import { decryptText, isEncryptedValue, nikIndex } from "@/lib/crypto/field-encryption";
import { profileCompleteness } from "@/lib/employee-profile";
import {
  compareFamilyMembers,
  openCandidate,
  openEmployee,
  openFamilyMember,
  openJson,
  openLines,
  protectAuditValue,
  sealCandidateData,
  sealEmployeeData,
  sealFamilyData,
  sealJson,
  sealLines,
} from "@/lib/services/personal-data";

const SELF = {
  nik: "3171012345678901",
  kkNo: "3171019876543210",
  birthDate: "1990-05-17",
  phone: "+6281234567890",
  npwp: "123456789012345",
  bpjsTkNo: "12345678901",
  bpjsKesNo: "1234567890123",
  emergencyName: "Siti Aminah",
  emergencyRelation: "Kakak",
  emergencyPhone: null,
};

describe("sealEmployeeData / openEmployee", () => {
  it("kolom pribadi dikunci, kolom lain tidak disentuh, nikHash ikut diisi", () => {
    const sealed = sealEmployeeData(SELF);
    for (const field of ["nik", "kkNo", "birthDate", "phone", "npwp", "bpjsTkNo", "bpjsKesNo", "emergencyName", "emergencyRelation"] as const) {
      expect(isEncryptedValue(sealed[field]!)).toBe(true);
    }
    expect(sealed.emergencyPhone).toBeNull();
    expect(sealed.nikHash).toBe(nikIndex(SELF.nik));
    expect(JSON.stringify(sealed)).not.toContain(SELF.nik);

    const opened = openEmployee({ ...sealed, fullName: "Andi Pratama", address: "Jl. Melati 1" });
    expect(opened).toEqual({ ...SELF, fullName: "Andi Pratama", address: "Jl. Melati 1" });
    expect("nikHash" in opened).toBe(false);
  });

  it("NIK dikosongkan → nikHash null; tanpa kolom nik → nikHash tidak disentuh", () => {
    expect(sealEmployeeData({ nik: null }).nikHash).toBeNull();
    expect("nikHash" in sealEmployeeData({ phone: "+6281234567890" })).toBe(false);
  });

  it("persen & daftar kelengkapan profil sama sebelum dan sesudah dikunci", () => {
    const plain = { ...SELF, birthPlace: "Jakarta", gender: "MALE", address: null };
    expect(profileCompleteness({ ...plain, ...sealEmployeeData(SELF) })).toEqual(profileCompleteness(plain));
  });
});

describe("keluarga & kandidat", () => {
  it("NIK & tanggal lahir keluarga dikunci lalu kembali utuh", () => {
    const sealed = sealFamilyData({ nik: "3171014405920002", birthDate: "2018-03-12" });
    expect(isEncryptedValue(sealed.nik!)).toBe(true);
    expect(isEncryptedValue(sealed.birthDate!)).toBe(true);
    expect(openFamilyMember({ ...sealed, fullName: "Bima" })).toEqual({ nik: "3171014405920002", birthDate: "2018-03-12", fullName: "Bima" });
  });

  it("NIK & HP kandidat dikunci lalu kembali utuh; kolom lain tidak disentuh", () => {
    const sealed = sealCandidateData({ nik: "3171017001990005", phone: "+6281211112222", email: "rian@test.local" });
    expect(sealed.email).toBe("rian@test.local");
    expect(isEncryptedValue(sealed.phone!)).toBe(true);
    expect(openCandidate(sealed)).toEqual({ nik: "3171017001990005", phone: "+6281211112222", email: "rian@test.local" });
  });
});

describe("payload & ringkasan permintaan perubahan", () => {
  it("payload Json disimpan sebagai satu string terenkripsi; payload lama (objek) dibaca apa adanya", () => {
    const payload = { nik: "3171012345678901", address: "Jl. Melati 1" };
    const sealed = sealJson(payload);
    expect(isEncryptedValue(sealed)).toBe(true);
    expect(openJson(sealed)).toEqual(payload);
    expect(openJson(payload)).toEqual(payload);
  });

  it("ringkasan per baris terenkripsi; ringkasan lama dibaca apa adanya", () => {
    const lines = ["NIK: — → 3171012345678901", "Alamat: — → Jl. Melati 1"];
    const sealed = sealLines(lines);
    expect(sealed.every(isEncryptedValue)).toBe(true);
    expect(openLines(sealed)).toEqual(lines);
    expect(openLines(lines)).toEqual(lines);
  });
});

describe("compareFamilyMembers", () => {
  it("sama dengan ORDER BY lama: hubungan desc (anak dulu), tanggal lahir asc (kosong di akhir), lalu waktu input", () => {
    const at = (second: number) => new Date(Date.UTC(2026, 9, 1, 0, 0, second));
    const members: { name: string; relation: FamilyRelation; birthDate: string | null; createdAt: Date }[] = [
      { name: "Rina", relation: "SPOUSE", birthDate: "1993-05-04", createdAt: at(0) },
      { name: "Bima", relation: "CHILD", birthDate: "2018-03-12", createdAt: at(1) },
      { name: "Citra", relation: "CHILD", birthDate: null, createdAt: at(2) },
      { name: "Dewi", relation: "CHILD", birthDate: "2015-02-09", createdAt: at(3) },
      { name: "Eka", relation: "CHILD", birthDate: "2015-02-09", createdAt: at(4) },
      { name: "Fajar", relation: "CHILD", birthDate: null, createdAt: at(5) },
    ];
    // Urutan Rina/Bima/Citra/Dewi = hasil ORDER BY PostgreSQL di DB dev sebelum migrasi (2026-10-20).
    expect([...members].sort(compareFamilyMembers).map((m) => m.name)).toEqual(["Dewi", "Eka", "Bima", "Citra", "Fajar", "Rina"]);
  });
});

describe("protectAuditValue", () => {
  it("nilai pribadi yang masih terbuka dikunci; kolom lain & nilai terenkripsi tidak berubah", () => {
    const already = sealEmployeeData({ phone: "+6281234567890" }).phone!;
    const result = protectAuditValue("Employee", {
      nik: "3171012345678901",
      birthDate: new Date("1990-05-17T00:00:00Z"),
      phone: already,
      kkNo: null,
      email: "andi@artha-mitra.local",
      address: "Jl. Melati 1",
    }) as Record<string, string | null>;

    expect(decryptText(result.nik)).toBe("3171012345678901");
    expect(decryptText(result.birthDate)).toBe("1990-05-17");
    expect(result.phone).toBe(already);
    expect(result.kkNo).toBeNull();
    expect(result.email).toBe("andi@artha-mitra.local");
    expect(result.address).toBe("Jl. Melati 1");
  });

  it("entitas lain tidak disentuh", () => {
    const value = { nik: "3171012345678901", amount: 1 };
    expect(protectAuditValue("Reimbursement", value)).toBe(value);
  });

  it("permintaan perubahan: payload & ringkasan dikunci", () => {
    const result = protectAuditValue("ProfileChangeRequest", {
      number: "PRF/2026/10/0001",
      payload: { nik: "3171012345678901" },
      summary: ["NIK: — → 3171012345678901"],
    }) as { number: string; payload: string; summary: string[] };

    expect(result.number).toBe("PRF/2026/10/0001");
    expect(openJson(result.payload)).toEqual({ nik: "3171012345678901" });
    expect(openLines(result.summary)).toEqual(["NIK: — → 3171012345678901"]);
    expect(JSON.stringify(result)).not.toContain("3171012345678901");
  });
});
