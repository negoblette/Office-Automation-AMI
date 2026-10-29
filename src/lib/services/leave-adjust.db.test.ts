import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adjustLeaveBalance } from "@/lib/services/leave-adjust";
import { getCurrentBalances, listLeaveAdjustments } from "@/lib/services/leave-queries";
import { leaveAdjustmentSchema } from "@/lib/validators/leave";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
let andiEmployee: string;

beforeEach(async () => {
  u = await resetAndSeed();
  andiEmployee = (await testDb.user.findUniqueOrThrow({ where: { id: u.andi } })).employeeId!;
});

afterAll(async () => {
  await testDb.$disconnect();
});

const remaining = async () => (await getCurrentBalances(testDb, [andiEmployee]))[0].remaining;
const adjust = (values: Record<string, unknown>) => adjustLeaveBalance(testDb, u.ika, andiEmployee, leaveAdjustmentSchema.parse(values));

describe("edit sisa cuti oleh Admin (2026-10-28)", () => {
  it("atur sisa menjadi angka tertentu (boleh minus), selisihnya tercatat; tambah/kurangi tetap bisa", async () => {
    const before = await remaining();
    await adjust({ mode: "SET", days: -3, reason: "Bolos 3 hari setelah jatah habis" });
    expect(await remaining()).toBe(-3);
    const [latest] = await listLeaveAdjustments(testDb, andiEmployee);
    expect(latest).toMatchObject({ days: -3 - before });
    expect(latest.reason).toContain(`Sisa diatur menjadi -3 hari (sebelumnya ${before})`);

    await expect(adjust({ mode: "SET", days: -3, reason: "Tidak berubah" })).rejects.toThrow("Sisa cuti sudah -3 hari");
    await adjust({ mode: "DELTA", days: 2, reason: "Pemutihan" });
    expect(await remaining()).toBe(-1);
  });

  it("validasi: tambah/kurangi tidak boleh 0 atau > 30; atur sisa maks ±60", () => {
    expect(leaveAdjustmentSchema.safeParse({ mode: "DELTA", days: 0, reason: "abc" }).success).toBe(false);
    expect(leaveAdjustmentSchema.safeParse({ mode: "DELTA", days: 31, reason: "abc" }).success).toBe(false);
    expect(leaveAdjustmentSchema.safeParse({ mode: "SET", days: 0, reason: "abc" }).success).toBe(true);
    expect(leaveAdjustmentSchema.safeParse({ mode: "SET", days: -61, reason: "abc" }).success).toBe(false);
    expect(leaveAdjustmentSchema.parse({ days: 1, reason: "abc" }).mode).toBe("DELTA");
  });
});
