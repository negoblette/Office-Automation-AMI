// Helper test database (`*.db.test.ts`). Database dibuat ulang oleh vitest.db-setup.ts.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import { type Division, PrismaClient, type Role } from "@/generated/prisma/client";

export const testDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }),
});

/** Kosongkan semua tabel (kecuali riwayat migrasi) sebelum tiap test. */
export async function resetDb() {
  const tables = await testDb.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(", ");
  await testDb.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let cachedHash: string | undefined;

/** Buat karyawan + user + periode aktif untuk kebutuhan test. */
export async function createTestEmployee(options: {
  fullName: string;
  email: string;
  division?: Division;
  role?: Role;
  startDate?: string;
}) {
  cachedHash ??= await argon2.hash("Rahasia123!");
  const employee = await testDb.employee.create({
    data: {
      fullName: options.fullName,
      email: options.email,
      division: options.division ?? "ENGINEER",
      position: "Staf",
      periods: { create: { startDate: new Date(`${options.startDate ?? "2020-01-01"}T00:00:00Z`) } },
      user: { create: { email: options.email, passwordHash: cachedHash, role: options.role ?? "STAFF" } },
    },
    include: { user: true },
  });
  return { employeeId: employee.id, userId: employee.user!.id };
}
