import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedProduction } from "../../../prisma/seed-lib";
import { resetDb, testDb } from "@/test/db";

beforeEach(async () => {
  await resetDb();
  await testDb.division.deleteMany(); // resetDb mengisi divisi bawaan untuk test lain; produksi mulai kosong.
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("seed produksi (SEED_MODE=production, 2026-10-29)", () => {
  it("hanya akun Admin sistem + aturan cuti — tanpa data contoh; aman diulang", async () => {
    await seedProduction(testDb, "hash-awal", " Admin-OA@Artha-Mitra.co.id ");
    await seedProduction(testDb, "hash-lain", "admin-oa@artha-mitra.co.id");

    const users = await testDb.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: "admin-oa@artha-mitra.co.id", role: "ADMIN", employeeId: null, mustChangePassword: true, passwordHash: "hash-awal" });
    expect(await testDb.leavePolicy.count()).toBe(4);
    expect(await testDb.appSetting.findUnique({ where: { key: "leave.maxCarryOver" } })).toMatchObject({ value: 3 });

    const [employees, divisions, flows, types, categories] = await Promise.all([
      testDb.employee.count(),
      testDb.division.count(),
      testDb.approvalFlow.count(),
      testDb.reimburseType.count(),
      testDb.healthCategory.count(),
    ]);
    expect({ employees, divisions, flows, types, categories }).toEqual({ employees: 0, divisions: 0, flows: 0, types: 0, categories: 0 });
  });
});
