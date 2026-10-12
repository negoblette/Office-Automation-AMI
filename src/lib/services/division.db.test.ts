import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApproval } from "@/lib/services/approval";
import { divisionCodeFromName, divisionLabels, saveDivision } from "@/lib/services/division";
import { createEmployee } from "@/lib/services/employee";
import { employeeCreateSchema } from "@/lib/validators/employee";
import { createTestEmployee, testDb } from "@/test/db";
import { createApprovalEntity } from "@/test/entities";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;

beforeEach(async () => {
  u = await resetAndSeed();
});

afterAll(async () => {
  await testDb.$disconnect();
});

const submitReimburse = async (requesterId: string) => {
  const entityId = await createApprovalEntity("REIMBURSE", requesterId);
  return testDb.$transaction((tx) => buildApproval(tx, { module: "REIMBURSE", entityId, entityNumber: "RMB/2026/10/0001", requesterId }));
};

describe("divisi master (2026-10-12)", () => {
  it("bawaan: Umum, Engineer, Sales, Direktur, HR, Finance", async () => {
    expect(Object.values(await divisionLabels(testDb))).toEqual(["Umum", "Engineer", "Sales", "Direktur", "HR", "Finance"]);
  });

  it("HR & Finance tanpa alur sendiri → ikut alur Umum (Ci Ika / Ko Leonard); tipe reimburse ikut Umum", async () => {
    const hr = await createTestEmployee({ fullName: "Hana", email: "hana@test.local", division: "HR" });
    const result = await submitReimburse(hr.userId);
    expect(result.status).toBe("PENDING");
    expect([...result.notifications[0].recipientIds].sort()).toEqual([u.ika, u.leonard].sort());
    const types = await testDb.reimburseType.findMany({ where: { divisions: { has: "FINANCE" } } });
    expect(types).toHaveLength(6);
  });

  it("Admin menambah divisi baru: kode dari nama, ikut alur & tipe reimburse divisi acuan; nama ganda ditolak", async () => {
    expect(divisionCodeFromName("Business Development")).toBe("BUSINESS_DEVELOPMENT");
    const created = await saveDivision(testDb, u.ika, null, { name: "Marketing", followsCode: "SALES", isActive: true });
    expect(created).toMatchObject({ code: "MARKETING", followsCode: "SALES" });
    expect(await testDb.reimburseType.count({ where: { divisions: { has: "MARKETING" } } })).toBe(6);

    const mkt = await createTestEmployee({ fullName: "Maya", email: "maya@test.local", division: "MARKETING" });
    const result = await submitReimburse(mkt.userId);
    expect([...result.notifications[0].recipientIds].sort()).toEqual([u.darwin, u.leonard].sort()); // alur Sales

    await expect(saveDivision(testDb, u.ika, null, { name: "marketing", followsCode: null, isActive: true })).rejects.toThrow("Nama divisi sudah dipakai");
    // Masih ada karyawan aktif → tidak bisa dinonaktifkan.
    await expect(saveDivision(testDb, u.ika, "MARKETING", { name: "Marketing", followsCode: "SALES", isActive: false })).rejects.toThrow("Masih ada 1 karyawan aktif");
  });

  it("kode divisi tak dikenal ditolak saat membuat karyawan", async () => {
    const input = employeeCreateSchema.parse({
      fullName: "Budi",
      email: "budi@test.local",
      division: "MARKETING",
      position: "Staf",
      startDate: "2026-01-05",
      role: "STAFF",
      password: "Rahasia123!",
    });
    await expect(createEmployee(testDb, u.ika, input)).rejects.toThrow("Divisi tidak ditemukan atau nonaktif: MARKETING");
  });
});
