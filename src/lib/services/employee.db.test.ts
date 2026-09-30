import argon2 from "argon2";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ServiceError } from "@/lib/services/errors";
import {
  createEmployee,
  rehireEmployee,
  resignEmployee,
  updateByAdmin,
  updateSelf,
} from "@/lib/services/employee";
import { createTestEmployee, resetDb, testDb } from "@/test/db";
import {
  employeeAdminUpdateSchema,
  employeeCreateSchema,
  employeeSelfSchema,
} from "@/lib/validators/employee";

let admin: { employeeId: string; userId: string };

beforeEach(async () => {
  await resetDb();
  admin = await createTestEmployee({ fullName: "Yosep", email: "yosep@test.local", role: "ADMIN" });
});

afterAll(async () => {
  await testDb.$disconnect();
});

const selfInput = (overrides: Record<string, unknown> = {}) =>
  employeeSelfSchema.parse({ fullName: "Andi Pratama", position: "Engineer", maritalStatus: "SINGLE", ...overrides });

async function auditActions(entityId: string) {
  const logs = await testDb.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: "asc" } });
  return logs.map((log) => log.action);
}

describe("createEmployee (akun minimal oleh Admin)", () => {
  const input = employeeCreateSchema.parse({
    fullName: "budi santoso",
    email: "Budi@Test.local",
    division: "SALES",
    position: "Account Manager",
    startDate: "2026-10-01",
    role: "STAFF",
    password: "Awal12345",
  });

  it("membuat Employee + periode kerja + User aktif dengan password awal, dan tercatat di audit", async () => {
    const { employeeId, userId } = await createEmployee(testDb, admin.userId, input);

    const employee = await testDb.employee.findUniqueOrThrow({
      where: { id: employeeId },
      include: { periods: true, user: true },
    });
    expect(employee).toMatchObject({
      fullName: "Budi Santoso",
      email: "budi@test.local",
      division: "SALES",
      status: "ACTIVE",
      nik: null,
    });
    expect(employee.periods).toHaveLength(1);
    expect(employee.periods[0].startDate.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(employee.user).toMatchObject({ id: userId, email: "budi@test.local", role: "STAFF", isActive: true });
    expect(await argon2.verify(employee.user!.passwordHash, "Awal12345")).toBe(true);

    const log = await testDb.auditLog.findFirstOrThrow({ where: { entityId: employeeId } });
    expect(log).toMatchObject({ action: "CREATE", userId: admin.userId });
    expect(JSON.stringify(log.after)).not.toContain("passwordHash");
  });

  it("email yang sudah dipakai ditolak", async () => {
    await createEmployee(testDb, admin.userId, input);
    await expect(createEmployee(testDb, admin.userId, input)).rejects.toThrow(
      new ServiceError("Email sudah dipakai karyawan lain", "email"),
    );
  });
});

describe("updateSelf (isi data mandiri, EMP-06)", () => {
  it("staf melengkapi NIK, HP, dsb.; divisi & role tidak berubah", async () => {
    const andi = await createTestEmployee({ fullName: "Andi Pratama", email: "andi@test.local", division: "ENGINEER" });

    await updateSelf(
      testDb,
      andi.userId,
      andi.employeeId,
      // Walau request memuat divisi/role, schema staf membuangnya.
      employeeSelfSchema.parse({ ...selfInput(), nik: "3171012345678901", phone: "081234567890", division: "DIRECTOR", role: "ADMIN" }),
    );

    const employee = await testDb.employee.findUniqueOrThrow({ where: { id: andi.employeeId }, include: { user: true } });
    expect(employee).toMatchObject({ nik: "3171012345678901", phone: "+6281234567890", division: "ENGINEER" });
    expect(employee.user!.role).toBe("STAFF");
    expect(await auditActions(andi.employeeId)).toEqual(["UPDATE"]);
  });

  it("NIK yang sudah dipakai karyawan lain ditolak", async () => {
    const andi = await createTestEmployee({ fullName: "Andi", email: "andi@test.local" });
    const sinta = await createTestEmployee({ fullName: "Sinta", email: "sinta@test.local" });
    await updateSelf(testDb, andi.userId, andi.employeeId, selfInput({ nik: "3171012345678901" }));

    await expect(
      updateSelf(testDb, sinta.userId, sinta.employeeId, selfInput({ nik: "3171012345678901" })),
    ).rejects.toThrow(new ServiceError("NIK sudah terdaftar, hubungi Admin", "nik"));
  });

  it("mengisi ulang NIK milik sendiri tidak dianggap duplikat", async () => {
    const andi = await createTestEmployee({ fullName: "Andi", email: "andi@test.local" });
    await updateSelf(testDb, andi.userId, andi.employeeId, selfInput({ nik: "3171012345678901" }));
    await expect(
      updateSelf(testDb, andi.userId, andi.employeeId, selfInput({ nik: "3171012345678901", address: "Jakarta" })),
    ).resolves.toMatchObject({ address: "Jakarta" });
  });

  it("karyawan yang sudah resign tidak bisa mengubah data", async () => {
    const andi = await createTestEmployee({ fullName: "Andi", email: "andi@test.local" });
    await resignEmployee(testDb, admin.userId, andi.employeeId, "2026-09-30");
    await expect(updateSelf(testDb, andi.userId, andi.employeeId, selfInput())).rejects.toThrow(ServiceError);
  });
});

describe("updateByAdmin", () => {
  const adminInput = (overrides: Record<string, unknown> = {}) =>
    employeeAdminUpdateSchema.parse({
      ...selfInput(),
      email: "andi@test.local",
      division: "ENGINEER",
      role: "STAFF",
      startDate: "2020-01-01",
      ...overrides,
    });

  it("mengubah divisi, role, email (User ikut) dan tanggal masuk periode aktif", async () => {
    const andi = await createTestEmployee({ fullName: "Andi", email: "andi@test.local" });

    await updateByAdmin(
      testDb,
      admin.userId,
      andi.employeeId,
      adminInput({ email: "andi.pratama@test.local", division: "SALES", role: "ADMIN", startDate: "2019-06-01" }),
    );

    const employee = await testDb.employee.findUniqueOrThrow({
      where: { id: andi.employeeId },
      include: { user: true, periods: true },
    });
    expect(employee).toMatchObject({ email: "andi.pratama@test.local", division: "SALES" });
    expect(employee.user).toMatchObject({ email: "andi.pratama@test.local", role: "ADMIN" });
    expect(employee.periods[0].startDate.toISOString()).toBe("2019-06-01T00:00:00.000Z");
  });

  it("Admin tidak bisa mengubah role dirinya sendiri", async () => {
    await expect(
      updateByAdmin(testDb, admin.userId, admin.employeeId, adminInput({ email: "yosep@test.local", role: "STAFF" })),
    ).rejects.toThrow(new ServiceError("Anda tidak bisa mengubah role akun Anda sendiri", "role"));
  });

  it("email milik karyawan lain ditolak", async () => {
    const andi = await createTestEmployee({ fullName: "Andi", email: "andi@test.local" });
    await expect(
      updateByAdmin(testDb, admin.userId, andi.employeeId, adminInput({ email: "yosep@test.local" })),
    ).rejects.toThrow(new ServiceError("Email sudah dipakai karyawan lain", "email"));
  });
});

describe("resign & rehire (EMP-03, EMP-04)", () => {
  it("resign: periode ditutup, status RESIGNED, akun nonaktif, data tetap ada", async () => {
    const andi = await createTestEmployee({ fullName: "Andi", email: "andi@test.local", startDate: "2021-02-01" });
    await updateSelf(testDb, andi.userId, andi.employeeId, selfInput({ nik: "3171012345678901" }));

    await resignEmployee(testDb, admin.userId, andi.employeeId, "2026-09-30");

    const employee = await testDb.employee.findUniqueOrThrow({
      where: { id: andi.employeeId },
      include: { user: true, periods: true },
    });
    expect(employee).toMatchObject({ status: "RESIGNED", nik: "3171012345678901" });
    expect(employee.user!.isActive).toBe(false);
    expect(employee.periods[0]).toMatchObject({ endReason: "RESIGN" });
    expect(employee.periods[0].endDate!.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("resign: tanggal keluar sebelum tanggal masuk ditolak; resign dua kali ditolak; tidak bisa resign diri sendiri", async () => {
    const andi = await createTestEmployee({ fullName: "Andi", email: "andi@test.local", startDate: "2021-02-01" });
    await expect(resignEmployee(testDb, admin.userId, andi.employeeId, "2021-01-31")).rejects.toThrow(
      "Tanggal keluar tidak boleh sebelum tanggal masuk",
    );
    await resignEmployee(testDb, admin.userId, andi.employeeId, "2026-09-30");
    await expect(resignEmployee(testDb, admin.userId, andi.employeeId, "2026-10-01")).rejects.toThrow(
      "Karyawan sudah berstatus resign",
    );
    await expect(resignEmployee(testDb, admin.userId, admin.employeeId, "2026-10-01")).rejects.toThrow(
      "Anda tidak bisa me-resign akun Anda sendiri",
    );
  });

  it("rehire: record lama dipakai, EmploymentPeriod baru, status ACTIVE, akun aktif", async () => {
    const andi = await createTestEmployee({ fullName: "Andi", email: "andi@test.local", startDate: "2021-02-01" });
    await resignEmployee(testDb, admin.userId, andi.employeeId, "2026-09-30");

    await rehireEmployee(testDb, admin.userId, andi.employeeId, "2027-01-04");

    const employee = await testDb.employee.findUniqueOrThrow({
      where: { id: andi.employeeId },
      include: { user: true, periods: { orderBy: { startDate: "asc" } } },
    });
    expect(employee.status).toBe("ACTIVE");
    expect(employee.user!.isActive).toBe(true);
    expect(employee.periods.map((p) => [p.startDate.toISOString().slice(0, 10), p.endDate?.toISOString().slice(0, 10) ?? null])).toEqual([
      ["2021-02-01", "2026-09-30"],
      ["2027-01-04", null],
    ]);
    expect(await testDb.employee.count()).toBe(2); // admin + andi, tidak ada record baru
    expect(await auditActions(andi.employeeId)).toEqual(["RESIGN", "REHIRE"]);
  });

  it("rehire: tanggal masuk baru harus setelah tanggal keluar; karyawan aktif tidak bisa di-rehire", async () => {
    const andi = await createTestEmployee({ fullName: "Andi", email: "andi@test.local" });
    await expect(rehireEmployee(testDb, admin.userId, andi.employeeId, "2027-01-04")).rejects.toThrow("Karyawan masih aktif");
    await resignEmployee(testDb, admin.userId, andi.employeeId, "2026-09-30");
    await expect(rehireEmployee(testDb, admin.userId, andi.employeeId, "2026-09-30")).rejects.toThrow(
      "Tanggal masuk baru harus setelah tanggal keluar sebelumnya",
    );
  });
});
