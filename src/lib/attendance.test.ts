import { describe, expect, it } from "vitest";
import { dayStatus, earlyLeaveMinutes, formatDuration, isWorkday, jakartaDateTime, lateMinutes, timeToMinutes } from "@/lib/attendance";

const HOURS = { workStart: "08:00", workEnd: "17:00" };

describe("absensi", () => {
  it("jam Jakarta ↔ Date", () => {
    expect(jakartaDateTime("2026-09-25", "08:15").toISOString()).toBe("2026-09-25T01:15:00.000Z");
    expect(timeToMinutes("17:30")).toBe(1050);
  });

  it("hari kerja: tanpa Sabtu, Minggu, libur", () => {
    expect(isWorkday("2026-09-25", new Set())).toBe(true); // Jumat
    expect(isWorkday("2026-09-26", new Set())).toBe(false); // Sabtu
    expect(isWorkday("2026-09-25", new Set(["2026-09-25"]))).toBe(false);
  });

  it("terlambat setelah jam masuk; tidak dihitung di hari libur", () => {
    expect(lateMinutes(jakartaDateTime("2026-09-25", "08:00"), HOURS, true)).toBe(0);
    expect(lateMinutes(jakartaDateTime("2026-09-25", "08:14"), HOURS, true)).toBe(14);
    expect(lateMinutes(jakartaDateTime("2026-09-25", "07:30"), HOURS, true)).toBe(0);
    expect(lateMinutes(jakartaDateTime("2026-09-26", "10:00"), HOURS, false)).toBe(0);
  });

  it("pulang cepat sebelum jam pulang di hari yang sama", () => {
    expect(earlyLeaveMinutes(jakartaDateTime("2026-09-25", "16:30"), "2026-09-25", HOURS, true)).toBe(30);
    expect(earlyLeaveMinutes(jakartaDateTime("2026-09-25", "17:05"), "2026-09-25", HOURS, true)).toBe(0);
    expect(earlyLeaveMinutes(null, "2026-09-25", HOURS, true)).toBe(0);
    // Clock out lewat tengah malam (hari berikutnya) → bukan pulang cepat.
    expect(earlyLeaveMinutes(jakartaDateTime("2026-09-26", "01:00"), "2026-09-25", HOURS, true)).toBe(0);
  });

  it("durasi", () => {
    expect(formatDuration(495)).toBe("8 jam 15 menit");
    expect(formatDuration(480)).toBe("8 jam");
    expect(formatDuration(45)).toBe("45 menit");
  });
});

describe("status harian", () => {
  const base = { todayIso: "2026-09-25", employed: true, record: null, onLeave: false, holiday: false };
  it("absen tercatat", () => {
    expect(dayStatus({ ...base, dateIso: "2026-09-24", record: { clockOut: new Date(), lateMinutes: 0 } })).toBe("PRESENT");
    expect(dayStatus({ ...base, dateIso: "2026-09-24", record: { clockOut: new Date(), lateMinutes: 5 } })).toBe("LATE");
    expect(dayStatus({ ...base, dateIso: "2026-09-24", record: { clockOut: null, lateMinutes: 0 } })).toBe("NO_CLOCK_OUT");
    expect(dayStatus({ ...base, dateIso: "2026-09-25", record: { clockOut: null, lateMinutes: 0 } })).toBe("WORKING");
  });
  it("tanpa absen: cuti, akhir pekan, libur, belum / tidak hadir", () => {
    expect(dayStatus({ ...base, dateIso: "2026-09-24", onLeave: true })).toBe("LEAVE");
    expect(dayStatus({ ...base, dateIso: "2026-09-20" })).toBe("WEEKEND");
    expect(dayStatus({ ...base, dateIso: "2026-09-23", holiday: true })).toBe("HOLIDAY");
    expect(dayStatus({ ...base, dateIso: "2026-09-25" })).toBe("NOT_YET");
    expect(dayStatus({ ...base, dateIso: "2026-09-24" })).toBe("ABSENT");
    expect(dayStatus({ ...base, dateIso: "2026-09-24", employed: false })).toBe("NOT_EMPLOYED");
  });
});
