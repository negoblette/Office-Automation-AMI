// Fase 14.6: pemutihan / penyesuaian saldo, filter cuti per bulan, kalender cuti bulanan.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addLeaveAdjustment, ensureLeaveBalance } from "@/lib/services/leave-balance";
import { getCurrentBalances, getLeaveCalendar, listLeaveAdjustments, listLeaveRequests } from "@/lib/services/leave-queries";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
let andi: string;
let rudy: string;
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

beforeEach(async () => {
  u = await resetAndSeed();
  andi = (await testDb.user.findUniqueOrThrow({ where: { id: u.andi } })).employeeId!;
  rudy = (await testDb.user.findUniqueOrThrow({ where: { id: u.rudy } })).employeeId!;
});

afterAll(async () => {
  await testDb.$disconnect();
});

const leave = (employeeId: string, number: string, start: string, end: string, workingDays: number, status: "APPROVED" | "PENDING" = "APPROVED") =>
  testDb.leaveRequest.create({ data: { number, employeeId, startDate: d(start), endDate: d(end), workingDays, reason: "x", status } });

describe("pemutihan / penyesuaian saldo", () => {
  it("Admin menambah 2 hari lalu mengurangi 1 → sisa ikut berubah, tercatat di riwayat", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const before = (await getCurrentBalances(testDb, [andi]))[0].remaining;
    await testDb.$transaction((tx) => addLeaveAdjustment(tx, { employeeId: andi, refIso: today, days: 2, reason: "Pemutihan cuti bersama", source: "MANUAL", createdById: u.ika }));
    await testDb.$transaction((tx) => addLeaveAdjustment(tx, { employeeId: andi, refIso: today, days: -1, reason: "Koreksi", source: "MANUAL", createdById: u.ika }));
    const [after] = await getCurrentBalances(testDb, [andi]);
    expect(after.adjustment).toBe(1);
    expect(after.remaining).toBe(before + 1);
    const history = await listLeaveAdjustments(testDb, andi);
    expect(history.map((h) => [h.days, h.reason, h.createdBy])).toEqual([
      [-1, "Koreksi", "Ika"],
      [2, "Pemutihan cuti bersama", "Ika"],
    ]);
    await expect(testDb.$transaction((tx) => addLeaveAdjustment(tx, { employeeId: andi, refIso: today, days: 0, reason: "x", source: "MANUAL", createdById: u.ika }))).rejects.toThrow("tidak boleh 0");
  });

  it("saldo minus tahun ini mengurangi saldo tahun berikutnya", async () => {
    await testDb.$transaction(async (tx) => {
      const balance = await ensureLeaveBalance(tx, andi, "2026-06-01");
      await tx.leaveBalance.update({ where: { id: balance.id }, data: { used: balance.entitlement } });
      await addLeaveAdjustment(tx, { employeeId: andi, refIso: "2026-06-01", days: -2, reason: "Tidak hadir", source: "MANUAL", createdById: null });
    });
    const next = await testDb.$transaction((tx) => ensureLeaveBalance(tx, andi, "2027-01-05"));
    expect(next.carriedOver).toBe(-2);
  });
});

describe("filter cuti per bulan", () => {
  it("cuti lintas bulan tampil di kedua bulan; bulan lain tidak", async () => {
    await leave(andi, "LV/1", "2026-09-29", "2026-10-02", 4);
    await leave(andi, "LV/2", "2026-11-03", "2026-11-03", 1);
    const viewer = { role: "ADMIN" as const, employeeId: null };
    expect((await listLeaveRequests(testDb, viewer, "2026-09")).map((r) => r.number)).toEqual(["LV/1"]);
    expect((await listLeaveRequests(testDb, viewer, "2026-10")).map((r) => r.number)).toEqual(["LV/1"]);
    expect((await listLeaveRequests(testDb, viewer)).map((r) => r.number)).toEqual(["LV/2", "LV/1"]);
  });
});

describe("kalender cuti bulanan", () => {
  it("grid Senin–Minggu; cuti hanya di hari kerja; libur & Direktur ditandai; pending tidak tampil", async () => {
    await testDb.holiday.create({ data: { date: d("2026-10-02"), name: "Libur Uji" } });
    await leave(andi, "LV/1", "2026-09-30", "2026-10-05", 3); // Rab–Sen, lewat akhir pekan & libur
    await leave(rudy, "LV/2", "2026-10-07", "2026-10-07", 1);
    await leave(andi, "LV/3", "2026-10-08", "2026-10-08", 1, "PENDING");

    const weeks = await getLeaveCalendar(testDb, "2026-10");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0].date).toBe("2026-09-28"); // Senin
    const day = (iso: string) => weeks.flat().find((x) => x.date === iso)!;
    expect(day("2026-09-30")).toMatchObject({ inMonth: false, leaves: [{ name: "Andi Pratama", isDirector: false }] });
    expect(day("2026-10-01").leaves).toHaveLength(1);
    expect(day("2026-10-02")).toMatchObject({ holiday: "Libur Uji", leaves: [] });
    expect(day("2026-10-03")).toMatchObject({ weekend: true, leaves: [] });
    expect(day("2026-10-05").leaves).toHaveLength(1);
    expect(day("2026-10-07").leaves).toEqual([{ name: "Rudy", isDirector: true }]);
    expect(day("2026-10-08").leaves).toEqual([]);
  });
});
