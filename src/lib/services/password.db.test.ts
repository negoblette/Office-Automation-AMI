import argon2 from "argon2";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { changeOwnPassword } from "@/lib/services/password";
import { createTestEmployee, resetDb, testDb } from "@/test/db";

let userId: string;

beforeEach(async () => {
  await resetDb();
  ({ userId } = await createTestEmployee({ fullName: "Andi Pratama", email: "andi@artha-mitra.local" }));
  await testDb.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("changeOwnPassword (hardening 2026-10)", () => {
  it("password baru tersimpan, semua sesi lama berakhir, flag wajib-ganti hilang", async () => {
    await changeOwnPassword(testDb, userId, { currentPassword: "Rahasia123!", newPassword: "lampu merah di depan pasar baru" }, { ip: "10.0.0.1", userAgent: "vitest" });

    const user = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await argon2.verify(user.passwordHash, "lampu merah di depan pasar baru")).toBe(true);
    expect(user.sessionVersion).toBe(1);
    expect(user.mustChangePassword).toBe(false);
    expect(user.passwordChangedAt).not.toBeNull();

    const log = await testDb.auditLog.findFirstOrThrow({ where: { entity: "User", entityId: userId } });
    expect(JSON.stringify(log.after)).not.toContain("lampu");
    expect(log.ip).toBe("10.0.0.1");
  });

  it("password saat ini salah ditolak", async () => {
    await expect(
      changeOwnPassword(testDb, userId, { currentPassword: "salah", newPassword: "lampu merah di depan pasar baru" }),
    ).rejects.toThrow("Password saat ini salah");
  });

  it("password baru sama dengan yang lama ditolak", async () => {
    await expect(changeOwnPassword(testDb, userId, { currentPassword: "Rahasia123!", newPassword: "Rahasia123!" })).rejects.toThrow(
      "harus berbeda",
    );
  });

  it("password yang memuat nama pemilik ditolak", async () => {
    await expect(
      changeOwnPassword(testDb, userId, { currentPassword: "Rahasia123!", newPassword: "andipratama-di-kantor" }),
    ).rejects.toThrow("nama atau email");
  });
});
