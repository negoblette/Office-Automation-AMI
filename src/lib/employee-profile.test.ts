import { describe, expect, it } from "vitest";
import { profileCompleteness } from "@/lib/employee-profile";

describe("profileCompleteness", () => {
  it("akun baru (hanya data minimal dari Admin) → 0%", () => {
    expect(profileCompleteness({ nik: null, phone: null })).toEqual({
      filled: 0,
      total: 12,
      percent: 0,
      missing: [
        "NIK",
        "Nomor KK",
        "Tempat lahir",
        "Tanggal lahir",
        "Jenis kelamin",
        "Alamat",
        "Nomor HP",
        "NPWP",
        "BPJS Ketenagakerjaan",
        "BPJS Kesehatan",
        "Nama kontak darurat",
        "No HP kontak darurat",
      ],
    });
  });

  it("sebagian terisi; string kosong dihitung kosong", () => {
    const result = profileCompleteness({
      nik: "3171012345678901",
      kkNo: "3171012345678902",
      birthPlace: "Jakarta",
      birthDate: new Date("1995-04-17T00:00:00Z"),
      gender: "MALE",
      address: "",
      phone: "+6281234567890",
    });
    expect(result).toMatchObject({ filled: 6, percent: 50 });
    expect(result.missing).toEqual(["Alamat", "NPWP", "BPJS Ketenagakerjaan", "BPJS Kesehatan", "Nama kontak darurat", "No HP kontak darurat"]);
  });

  it("semua terisi → 100%", () => {
    const full = Object.fromEntries(
      ["nik", "kkNo", "birthPlace", "birthDate", "gender", "address", "phone", "npwp", "bpjsTkNo", "bpjsKesNo", "emergencyName", "emergencyPhone"].map((k) => [
        k,
        "x",
      ]),
    );
    expect(profileCompleteness(full)).toMatchObject({ filled: 12, percent: 100, missing: [] });
  });
});
