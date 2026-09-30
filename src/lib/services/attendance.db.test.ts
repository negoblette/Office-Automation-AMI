import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { jakartaDateTime } from "@/lib/attendance";
import type { Actor } from "@/lib/services/access";
import { clockIn, clockOut, correctAttendance, getWorkHours, saveWorkHours } from "@/lib/services/attendance";
import { getTodayAttendance, listMonthDays, monthSummary } from "@/lib/services/attendance-queries";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
let andi: Actor;
let yosepId: string;

beforeEach(async () => {
  const users = await resetAndSeed();
  const user = await testDb.user.findUniqueOrThrow({ where: { id: users.andi } });
  andi = { id: user.id, role: user.role, employeeId: user.employeeId };
  yosepId = users.yosep;
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("clock in / clock out", () => {
  it("jam dari server, terlambat & pulang cepat dihitung terhadap jam kerja", async () => {
    const inAt = jakartaDateTime("2026-09-25", "08:20"); // Jumat
    const record = await clockIn(testDb, andi, inAt);
    expect(record.lateMinutes).toBe(20);
    await expect(clockIn(testDb, andi, jakartaDateTime("2026-09-25", "09:00"))).rejects.toThrow("sudah clock in");

    const out = await clockOut(testDb, andi, jakartaDateTime("2026-09-25", "16:45"));
    expect(out.earlyLeaveMinutes).toBe(15);
    await expect(clockOut(testDb, andi, jakartaDateTime("2026-09-25", "17:10"))).rejects.toThrow("sudah clock out");

    expect(await getTodayAttendance(testDb, andi.employeeId!, jakartaDateTime("2026-09-25", "18:00"))).toMatchObject({
      clockIn: "08:20",
      clockOut: "16:45",
      canClockIn: false,
      canClockOut: false,
    });
    expect(await testDb.auditLog.count({ where: { entity: "Attendance" } })).toBe(2);
  });

  it("clock out tanpa clock in ditolak; akhir pekan & libur tidak dihitung terlambat", async () => {
    await expect(clockOut(testDb, andi, jakartaDateTime("2026-09-25", "17:00"))).rejects.toThrow("belum clock in");
    expect((await clockIn(testDb, andi, jakartaDateTime("2026-09-26", "10:00"))).lateMinutes).toBe(0); // Sabtu
    await testDb.holiday.create({ data: { date: d("2026-09-28"), name: "Libur Uji" } });
    expect((await clockIn(testDb, andi, jakartaDateTime("2026-09-28", "10:00"))).lateMinutes).toBe(0);
  });

  it("jam kerja dari Setting", async () => {
    await saveWorkHours(testDb, yosepId, { workStart: "09:00", workEnd: "18:00" });
    expect(await getWorkHours(testDb)).toEqual({ workStart: "09:00", workEnd: "18:00" });
    expect((await clockIn(testDb, andi, jakartaDateTime("2026-09-25", "08:50"))).lateMinutes).toBe(0);
  });

  it("karyawan resign tidak bisa absen", async () => {
    await testDb.employee.update({ where: { id: andi.employeeId! }, data: { status: "RESIGNED" } });
    await expect(clockIn(testDb, andi, jakartaDateTime("2026-09-25", "08:00"))).rejects.toThrow("karyawan aktif");
  });
});

describe("koreksi Admin", () => {
  it("lupa clock out → Admin isi jam pulang dengan alasan; status dihitung ulang & tercatat", async () => {
    await clockIn(testDb, andi, jakartaDateTime("2026-09-24", "08:05"));
    const fixed = await correctAttendance(testDb, yosepId, andi.employeeId!, {
      date: "2026-09-24",
      clockIn: "07:55",
      clockOut: "17:00",
      note: "Lupa clock out, konfirmasi atasan",
    });
    expect(fixed).toMatchObject({ lateMinutes: 0, earlyLeaveMinutes: 0, correctedById: yosepId, correctionNote: "Lupa clock out, konfirmasi atasan" });
    const audit = await testDb.auditLog.findFirstOrThrow({ where: { entity: "Attendance", action: "UPDATE", userId: yosepId } });
    expect(audit.entityId).toBe(fixed.id);
  });

  it("lupa clock in seharian → Admin membuat absen; tanggal depan & di luar periode kerja ditolak", async () => {
    const created = await correctAttendance(testDb, yosepId, andi.employeeId!, { date: "2026-09-23", clockIn: "08:30", clockOut: null, note: "Mesin error" });
    expect(created.lateMinutes).toBe(30);
    await expect(correctAttendance(testDb, yosepId, andi.employeeId!, { date: "2099-01-01", clockIn: "08:00", clockOut: null, note: "x x x" })).rejects.toThrow(
      "akan datang",
    );
    await expect(correctAttendance(testDb, yosepId, andi.employeeId!, { date: "2019-01-02", clockIn: "08:00", clockOut: null, note: "x x x" })).rejects.toThrow(
      "periode kerja",
    );
  });
});

describe("rekap", () => {
  it("riwayat bulan: hadir, terlambat, tidak clock out, cuti, libur, akhir pekan, tidak hadir, belum clock in", async () => {
    await clockIn(testDb, andi, jakartaDateTime("2026-09-21", "07:50"));
    await clockOut(testDb, andi, jakartaDateTime("2026-09-21", "17:00"));
    await clockIn(testDb, andi, jakartaDateTime("2026-09-22", "08:10")); // lupa clock out
    await testDb.leaveRequest.create({
      data: { number: "LV/2026/09/0001", employeeId: andi.employeeId!, startDate: d("2026-09-23"), endDate: d("2026-09-23"), workingDays: 1, reason: "x", status: "APPROVED" },
    });
    await testDb.holiday.create({ data: { date: d("2026-09-24"), name: "Libur Uji" } });

    const days = await listMonthDays(testDb, andi.employeeId!, "2026-09", "2026-09-25");
    const byDate = Object.fromEntries(days.map((day) => [day.date, day.status]));
    expect(byDate).toMatchObject({
      "2026-09-25": "NOT_YET",
      "2026-09-24": "HOLIDAY",
      "2026-09-23": "LEAVE",
      "2026-09-22": "NO_CLOCK_OUT",
      "2026-09-21": "PRESENT",
      "2026-09-20": "WEEKEND",
      "2026-09-18": "ABSENT",
    });
    expect(days.find((day) => day.date === "2026-09-21")).toMatchObject({ clockIn: "07:50", clockOut: "17:00", workedMinutes: 550 });

    const summary = (await monthSummary(testDb, "2026-09", "2026-09-25")).find((row) => row.employeeId === andi.employeeId)!;
    expect(summary).toMatchObject({ present: 2, late: 1, noClockOut: 1, leave: 1, lateMinutes: 10 });
    expect(summary.today?.status).toBe("NOT_YET");
  });
});
