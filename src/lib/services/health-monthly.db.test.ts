// Rekap bulanan klaim kesehatan untuk PDF (2026-11-19): per karyawan per bulan, hak akses, batas bulan, status.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { fromIsoDate } from "@/lib/format";
import { healthMonthlyGroups } from "@/lib/services/health-queries";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
let emp: Record<string, string>;
let seq = 0;

beforeEach(async () => {
  u = await resetAndSeed();
  const users = await testDb.user.findMany({ select: { id: true, employeeId: true } });
  emp = Object.fromEntries(Object.entries(u).map(([key, id]) => [key, users.find((user) => user.id === id)?.employeeId ?? ""]));
});

afterAll(async () => {
  await testDb.$disconnect();
});

async function claim(key: string, date: string, status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED") {
  const category = await testDb.healthCategory.findFirstOrThrow();
  const row = await testDb.healthClaim.create({
    data: { number: `UJI-HC-${++seq}`, employeeId: emp[key], categoryId: category.id, claimDate: fromIsoDate(date), amount: 100_000n, status },
  });
  return row.id;
}
const viewer = (key: string, role: "ADMIN" | "STAFF") => ({ role, employeeId: emp[key] });
const ids = (groups: { employeeId: string; claimIds: Set<string> }[]) => groups.map((g) => [g.employeeId, [...g.claimIds].sort()]);

describe("rekap bulanan klaim kesehatan", () => {
  it("klaim menunggu / disetujui di bulan itu; draft, ditolak, & bulan lain tidak ikut; batas Desember → Januari", async () => {
    const a1 = await claim("andi", "2026-12-01", "APPROVED");
    const a2 = await claim("andi", "2026-12-31", "PENDING");
    await claim("andi", "2026-12-15", "DRAFT");
    await claim("andi", "2026-12-16", "REJECTED");
    await claim("andi", "2026-11-30", "APPROVED");
    await claim("andi", "2027-01-01", "APPROVED");
    const s1 = await claim("sinta", "2026-12-10", "APPROVED");

    const all = await healthMonthlyGroups(testDb, viewer("ika", "ADMIN"), { month: "2026-12", employeeId: null });
    expect(ids(all)).toEqual([
      [emp.andi, [a1, a2].sort()],
      [emp.sinta, [s1]],
    ]);
    expect(all.every((g) => g.year === 2026)).toBe(true);
    expect(ids(await healthMonthlyGroups(testDb, viewer("ika", "ADMIN"), { month: "2026-12", employeeId: emp.sinta }))).toEqual([[emp.sinta, [s1]]]);
  });

  it("selain Admin selalu hanya miliknya sendiri, walau meminta karyawan lain / semua", async () => {
    const own = await claim("andi", "2026-12-05", "APPROVED");
    await claim("sinta", "2026-12-05", "APPROVED");
    const staff = viewer("andi", "STAFF");
    expect(ids(await healthMonthlyGroups(testDb, staff, { month: "2026-12", employeeId: emp.sinta }))).toEqual([[emp.andi, [own]]]);
    expect(ids(await healthMonthlyGroups(testDb, staff, { month: "2026-12", employeeId: null }))).toEqual([[emp.andi, [own]]]);
    // Tanpa data karyawan → tidak ada apa-apa.
    expect(await healthMonthlyGroups(testDb, { role: "STAFF", employeeId: null }, { month: "2026-12", employeeId: null })).toEqual([]);
    // Bulan tidak valid → kosong.
    expect(await healthMonthlyGroups(testDb, viewer("ika", "ADMIN"), { month: "2026-13", employeeId: null })).toEqual([]);
  });
});
