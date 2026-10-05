import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { fromIsoDate } from "@/lib/format";
import type { Actor } from "@/lib/services/access";
import { approveRequest } from "@/lib/services/approval";
import { addHolidays, submitLeaveRequest } from "@/lib/services/leave";
import { ensureLeaveBalance, rolloverLeaveBalances } from "@/lib/services/leave-balance";
import { leaveRequestSchema } from "@/lib/validators/leave";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const actors: Record<string, Actor> = {};

beforeEach(async () => {
  u = await resetAndSeed();
  for (const [key, id] of Object.entries(u)) {
    const user = await testDb.user.findUniqueOrThrow({ where: { id } });
    actors[key] = { id: user.id, role: user.role, employeeId: user.employeeId };
  }
});

afterAll(async () => {
  await testDb.$disconnect();
});

const leave = (startDate: string, endDate: string, reason = "Keperluan keluarga") => leaveRequestSchema.parse({ startDate, endDate, reason });
const balanceOf = (key: string, ref: string) => testDb.$transaction((tx) => ensureLeaveBalance(tx, actors[key].employeeId!, ref));
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("saldo per tahun kalender (seed: Andi masuk 2021-02-01, Sinta 2023-06-12, Devi 2019-09-02, Rudy 2010-01-04)", () => {
  it.each([
    ["andi", "2026-10-05", "2026-01-01", "2026-12-31", 12], // per 1 Jan 2026: 4 th
    ["sinta", "2026-10-05", "2026-01-01", "2026-12-31", 12], // 2 th
    ["devi", "2026-10-05", "2026-01-01", "2026-12-31", 15], // 6 th
    ["andi", "2027-03-01", "2027-01-01", "2027-12-31", 15], // 5 th per 1 Jan 2027
    ["rudy", "2026-10-05", "2026-01-01", "2026-12-31", 18], // 15 th penuh per 1 Jan 2026
    ["andi", "2021-06-01", "2021-02-01", "2021-12-31", 0], // tahun masuk: belum genap 1 tahun
    ["andi", "2022-06-01", "2022-01-01", "2022-12-31", 10], // genap 1 tahun Feb 2022: 12 − 2 = 10 hari
  ])("%s pada %s → periode %s..%s, jatah %i", async (key, ref, start, end, days) => {
    const balance = await balanceOf(key, ref);
    expect([iso(balance.periodStart), iso(balance.periodEnd), balance.entitlement, balance.carriedOver]).toEqual([start, end, days, 0]);
  });

  it("carry over dari periode sebelumnya maks 3, dan saldo tidak dibuat ganda", async () => {
    const previous = await balanceOf("andi", "2025-06-01");
    await testDb.leaveBalance.update({ where: { id: previous.id }, data: { used: 10 } }); // sisa 2
    expect((await balanceOf("andi", "2026-01-02")).carriedOver).toBe(2);
    expect(await testDb.leaveBalance.count({ where: { employeeId: actors.andi.employeeId! } })).toBe(2);
    await balanceOf("andi", "2026-12-31");
    expect(await testDb.leaveBalance.count({ where: { employeeId: actors.andi.employeeId! } })).toBe(2);
  });

  it("rollover membuat saldo untuk semua karyawan aktif, sekali saja", async () => {
    expect(await rolloverLeaveBalances(testDb, "2026-10-05")).toBe(8);
    expect(await rolloverLeaveBalances(testDb, "2026-10-05")).toBe(0);
  });
});

describe("pengajuan cuti", () => {
  it("hari kerja tanpa akhir pekan & libur; nomor LV; hanya Rudy yang approve; saldo terpotong setelah APPROVED final", async () => {
    await addHolidays(testDb, u.yosep, [{ date: "2026-10-07", name: "Libur Uji", isNational: false }]);
    // Senin 5 Okt – Minggu 11 Okt 2026: 5 hari kerja − 1 libur = 4
    const result = await submitLeaveRequest(testDb, actors.andi, leave("2026-10-05", "2026-10-11"));
    expect(result).toMatchObject({ workingDays: 4, status: "PENDING" });
    expect(result.number).toMatch(/^LV\/\d{4}\/\d{2}\/0001$/);

    const request = await testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "LEAVE", entityId: result.leaveRequestId } } });
    await expect(approveRequest(testDb, { requestId: request.id, actorId: u.yosep })).rejects.toThrow("tidak berhak");
    expect((await balanceOf("andi", "2026-10-05")).used).toBe(0); // belum disetujui
    await approveRequest(testDb, { requestId: request.id, actorId: u.rudy });

    expect((await balanceOf("andi", "2026-10-05")).used).toBe(4);
    const saved = await testDb.leaveRequest.findUniqueOrThrow({ where: { id: result.leaveRequestId } });
    expect(saved.status).toBe("APPROVED");
    expect(saved.approvedAt).not.toBeNull();
  });

  it("melebihi sisa saldo ditolak; pengajuan PENDING ikut dihitung (LV-08)", async () => {
    // 12 hari jatah. 2 minggu penuh = 10 hari kerja → sisa 2.
    await submitLeaveRequest(testDb, actors.andi, leave("2026-10-05", "2026-10-16"));
    await expect(submitLeaveRequest(testDb, actors.andi, leave("2026-11-02", "2026-11-04"))).rejects.toThrow(
      "Sisa saldo cuti 2 hari, pengajuan 3 hari kerja (LV-08)",
    );
    await expect(submitLeaveRequest(testDb, actors.andi, leave("2026-11-02", "2026-11-03"))).resolves.toMatchObject({ workingDays: 2 });
  });

  it("belum genap 1 tahun ditolak; di tahun genap 1 tahun baru bisa sejak tanggal genap-nya (prorata 10 hari)", async () => {
    await testDb.employmentPeriod.updateMany({ where: { employeeId: actors.sinta.employeeId! }, data: { startDate: fromIsoDate("2026-02-10") } });
    await expect(submitLeaveRequest(testDb, actors.sinta, leave("2026-10-05", "2026-10-05"))).rejects.toThrow(
      "Cuti baru bisa dipakai setelah genap 1 tahun masa kerja (mulai 10 Februari 2027)",
    );
    await expect(submitLeaveRequest(testDb, actors.sinta, leave("2027-02-01", "2027-02-01"))).rejects.toThrow("mulai 10 Februari 2027");
    await expect(submitLeaveRequest(testDb, actors.sinta, leave("2027-02-10", "2027-02-10"))).resolves.toMatchObject({ workingDays: 1 });
    expect((await balanceOf("sinta", "2027-02-10")).entitlement).toBe(10);
  });

  it("tanggal bertabrakan, hanya akhir pekan, dan lintas periode ditolak", async () => {
    const first = await submitLeaveRequest(testDb, actors.andi, leave("2026-10-05", "2026-10-06"));
    await expect(submitLeaveRequest(testDb, actors.andi, leave("2026-10-06", "2026-10-07"))).rejects.toThrow(`bertabrakan dengan cuti ${first.number}`);
    await expect(submitLeaveRequest(testDb, actors.andi, leave("2026-10-10", "2026-10-11"))).rejects.toThrow("tidak berisi hari kerja");
    await expect(submitLeaveRequest(testDb, actors.andi, leave("2026-12-30", "2027-01-04"))).rejects.toThrow("melewati akhir tahun");
  });

  it("Rudy (Direktur): langsung APPROVED dan saldo langsung terpotong", async () => {
    const result = await submitLeaveRequest(testDb, actors.rudy, leave("2026-10-05", "2026-10-06"));
    expect(result.status).toBe("APPROVED");
    expect((await balanceOf("rudy", "2026-10-05")).used).toBe(2);
  });

  it("dua pengajuan bersamaan tidak bisa melewati saldo", async () => {
    // Masing-masing 7 hari kerja; saldo 12 → hanya satu yang boleh lolos.
    const results = await Promise.allSettled([
      submitLeaveRequest(testDb, actors.andi, leave("2026-10-05", "2026-10-13")),
      submitLeaveRequest(testDb, actors.andi, leave("2026-11-02", "2026-11-10")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});
