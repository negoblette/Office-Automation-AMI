import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { jakartaDateTime } from "@/lib/attendance";
import type { Actor } from "@/lib/services/access";
import { approveRequest } from "@/lib/services/approval";
import { clockIn } from "@/lib/services/attendance";
import { DEDUCTION_START_KEY, deductUnexcusedAbsences, submitAppeal } from "@/lib/services/attendance-appeal";
import { listMonthDays } from "@/lib/services/attendance-queries";
import { getCurrentBalances } from "@/lib/services/leave-queries";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const actors: Record<string, Actor> = {};
const TODAY = "2026-10-14"; // Rabu

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

describe("appeal tidak hadir (Fase 14)", () => {
  it("appeal Sakit → Bu Ika menyetujui → hari itu tampil Sakit", async () => {
    const result = await submitAppeal(testDb, actors.andi, { date: "2026-10-12", reason: "SICK", note: "Demam" }, TODAY);
    expect(result.number).toMatch(/^APL\//);
    expect(result.notifications[0].recipientIds).toEqual([u.ika]);

    let day = (await listMonthDays(testDb, actors.andi.employeeId!, "2026-10", TODAY)).find((d) => d.date === "2026-10-12")!;
    expect(day.status).toBe("APPEAL_PENDING");

    const request = await testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "ATTENDANCE_APPEAL", entityId: result.appealId } } });
    await approveRequest(testDb, { requestId: request.id, actorId: u.ika });
    day = (await listMonthDays(testDb, actors.andi.employeeId!, "2026-10", TODAY)).find((d) => d.date === "2026-10-12")!;
    expect(day).toMatchObject({ status: "SICK", appeal: { reason: "SICK", note: "Demam" } });
  });

  it("appeal Bu Ika → Ko Rudy / Ko Leonard", async () => {
    const result = await submitAppeal(testDb, actors.ika, { date: "2026-10-12", reason: "VISIT", note: "Kunjungan klien" }, TODAY);
    expect([...result.notifications[0].recipientIds].sort()).toEqual([u.rudy, u.leonard].sort());
  });

  it("validasi: hanya hari lalu ≤ 7 hari, hari kerja, tidak sudah absen, tidak dobel", async () => {
    const appeal = (date: string) => submitAppeal(testDb, actors.andi, { date, reason: "SICK", note: "x x x" }, TODAY);
    await expect(appeal(TODAY)).rejects.toThrow("sudah lewat");
    await expect(appeal("2026-10-06")).rejects.toThrow("Batas appeal");
    await expect(appeal("2026-10-11")).rejects.toThrow("bukan hari kerja"); // Minggu
    await clockIn(testDb, actors.andi, jakartaDateTime("2026-10-13", "08:00"));
    await expect(appeal("2026-10-13")).rejects.toThrow("sudah tercatat absen");
    await appeal("2026-10-07"); // tepat 7 hari
    await expect(appeal("2026-10-07")).rejects.toThrow("sudah pernah diajukan");
  });
});

describe("potong cuti otomatis", () => {
  it("hari kerja tanpa absen/cuti/appeal lewat 7 hari → −1 hari, sekali saja; sebelum tanggal mulai fitur tidak dihitung", async () => {
    await testDb.appSetting.create({ data: { key: DEDUCTION_START_KEY, value: "2026-10-01" } });
    const sinta = actors.sinta.employeeId!;
    // Semua karyawan selain Sinta "hadir" agar hitungan fokus: buat absen untuk mereka di rentang uji.
    const others = (await testDb.employee.findMany({ where: { status: "ACTIVE", id: { not: sinta } } })).map((e) => e.id);
    for (const day of ["2026-10-01", "2026-10-02", "2026-10-05"]) {
      for (const employeeId of others) {
        await testDb.attendance.create({ data: { employeeId, date: new Date(`${day}T00:00:00Z`), clockIn: jakartaDateTime(day, "08:00"), clockOut: jakartaDateTime(day, "17:00") } });
      }
    }
    // Sinta: 1 Okt hadir, 2 Okt tidak hadir (tanpa appeal), 5 Okt appeal (masih menunggu).
    await testDb.attendance.create({ data: { employeeId: sinta, date: new Date("2026-10-01T00:00:00Z"), clockIn: jakartaDateTime("2026-10-01", "08:00") } });
    await submitAppeal(testDb, actors.sinta, { date: "2026-10-05", reason: "SICK", note: "Sakit" }, "2026-10-06");

    const before = (await getCurrentBalances(testDb, [sinta]))[0].remaining;
    // 13 Okt: batas 2 Okt (9 Okt) & 5 Okt (12 Okt) sudah lewat; 6–5 Okt… hari setelah 5 Okt belum lewat 7 hari.
    const result = await deductUnexcusedAbsences(testDb, "2026-10-13");
    expect(result.deducted).toBe(1);
    expect((await getCurrentBalances(testDb, [sinta]))[0].remaining).toBe(before - 1);
    const adjustments = await testDb.leaveAdjustment.findMany({ where: { employeeId: sinta } });
    expect(adjustments.map((a) => [a.days, a.source, a.attendanceDate?.toISOString().slice(0, 10)])).toEqual([[-1, "ABSENCE", "2026-10-02"]]);

    // Dijalankan lagi hari yang sama: tidak dipotong dua kali.
    expect((await deductUnexcusedAbsences(testDb, "2026-10-13")).deducted).toBe(0);
    const day = (await listMonthDays(testDb, sinta, "2026-10", "2026-10-13")).find((d) => d.date === "2026-10-02")!;
    expect(day).toMatchObject({ status: "ABSENT", leaveDeducted: true, canAppeal: false });
  });

  it("hari pertama job berjalan menetapkan tanggal mulai → absen lama tidak dipotong", async () => {
    expect((await deductUnexcusedAbsences(testDb, TODAY)).deducted).toBe(0);
    expect((await testDb.appSetting.findUniqueOrThrow({ where: { key: DEDUCTION_START_KEY } })).value).toBe(TODAY);
  });
});
