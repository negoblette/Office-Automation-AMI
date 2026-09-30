import { describe, expect, it } from "vitest";
import { employeeAdminUpdateSchema, employeeCreateSchema, employeeSelfSchema } from "@/lib/validators/employee";

const validSelf = {
  fullName: "andi   pratama",
  position: "Engineer",
  maritalStatus: "SINGLE",
  nik: "3171 0123 4567 8901",
  phone: "0812-3456-7890",
  npwp: "01.234.567.8-901.000",
  bpjsTkNo: "12345678901",
  bpjsKesNo: "0001234567890",
  birthDate: "1995-04-17",
  employeeNo: "ami-0101",
  address: "",
  kkNo: "",
};

describe("employeeSelfSchema (isi data mandiri, EMP-06)", () => {
  it("data valid dinormalisasi; string kosong → null", () => {
    const result = employeeSelfSchema.parse(validSelf);
    expect(result).toMatchObject({
      fullName: "Andi Pratama",
      nik: "3171012345678901",
      phone: "+6281234567890",
      npwp: "012345678901000",
      employeeNo: "AMI-0101",
      address: null,
      kkNo: null,
      gender: null,
    });
  });

  it("field khusus Admin (divisi, role, email, tanggal masuk) DIBUANG walau dikirim", () => {
    const result = employeeSelfSchema.parse({
      ...validSelf,
      division: "DIRECTOR",
      role: "ADMIN",
      email: "hacker@x.com",
      startDate: "2000-01-01",
      status: "ACTIVE",
    });
    for (const key of ["division", "role", "email", "startDate", "status"]) {
      expect(result).not.toHaveProperty(key);
    }
  });

  it.each([
    ["bpjsTkNo", "1234567890", "Nomor BPJS Ketenagakerjaan harus 11 digit angka"],
    ["bpjsKesNo", "123456789012", "Nomor BPJS Kesehatan harus 13 digit angka"],
    ["nik", "123", "NIK harus 16 digit angka"],
    ["maritalStatus", "PACARAN", "Status pernikahan wajib dipilih"],
  ])("%s tidak valid → %s", (field, value, message) => {
    const result = employeeSelfSchema.safeParse({ ...validSelf, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: [field], message });
  });
});

describe("employeeCreateSchema (akun minimal oleh Admin)", () => {
  const valid = {
    fullName: "Budi Santoso",
    email: "Budi@Artha-Mitra.local",
    division: "SALES",
    position: "Account Manager",
    startDate: "2026-10-01",
    role: "STAFF",
    password: "Awal12345",
  };

  it("valid, email di-lowercase", () => {
    expect(employeeCreateSchema.parse(valid)).toMatchObject({ email: "budi@artha-mitra.local", division: "SALES" });
  });

  it("DIRECTOR adalah divisi yang sah", () => {
    expect(employeeCreateSchema.safeParse({ ...valid, division: "DIRECTOR" }).success).toBe(true);
  });

  it.each([
    ["password", "pendek", "Password minimal 8 karakter"],
    ["division", "MARKETING", "Divisi wajib dipilih"],
    ["role", "SUPERADMIN", "Role wajib dipilih"],
    ["startDate", "2026-02-30", "Tanggal tidak valid"],
  ])("%s tidak valid", (field, value, message) => {
    const result = employeeCreateSchema.safeParse({ ...valid, [field]: value });
    expect(result.error?.issues[0]).toMatchObject({ path: [field], message });
  });
});

describe("employeeAdminUpdateSchema", () => {
  it("Admin boleh mengubah divisi, role, email, dan tanggal masuk", () => {
    const result = employeeAdminUpdateSchema.parse({
      ...validSelf,
      email: "andi@artha-mitra.local",
      division: "SALES",
      role: "ADMIN",
      startDate: "2021-02-01",
    });
    expect(result).toMatchObject({ division: "SALES", role: "ADMIN", startDate: "2021-02-01" });
  });
});
