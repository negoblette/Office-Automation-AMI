import { describe, expect, it } from "vitest";
import {
  countWorkingDays,
  entitlementFor,
  firstUsableDate,
  fullYearsOfService,
  leaveYear,
  nextCarryOver,
  remainingDays,
  yearEntitlement,
} from "@/lib/leave";

const POLICIES = [
  { minYears: 0, maxYears: 0, days: 0 },
  { minYears: 1, maxYears: 5, days: 12 },
  { minYears: 6, maxYears: 15, days: 15 },
  { minYears: 16, maxYears: null, days: 18 },
];

describe("masa kerja & jatah (LV-02)", () => {
  it.each([
    [0, 0],
    [1, 12],
    [5, 12],
    [6, 15],
    [15, 15],
    [16, 18],
    [30, 18],
  ])("%i tahun → %i hari", (years, days) => {
    expect(entitlementFor(years, POLICIES)).toBe(days);
  });

  it.each([
    ["2021-02-01", "2026-01-31", 4], // sehari sebelum ulang tahun ke-5
    ["2021-02-01", "2026-02-01", 5],
    ["2026-09-24", "2026-09-24", 0],
    ["2026-09-24", "2026-01-01", 0], // tanggal acuan sebelum masuk
    ["2020-02-29", "2021-02-27", 0],
    ["2020-02-29", "2021-02-28", 1], // 29 Feb → ulang tahun 28 Feb di tahun non-kabisat
  ])("masuk %s, acuan %s → %i tahun penuh", (start, ref, years) => {
    expect(fullYearsOfService(start, ref)).toBe(years);
  });
});

describe("periode cuti = tahun kalender (keputusan user, OI-03 — prorata 2026-09-25)", () => {
  const entitlementOf = (start: string, ref: string) => yearEntitlement(leaveYear(start, ref), POLICIES);

  it("contoh user: masuk Feb 2026 → aktif Feb 2027 dengan 10 hari, cutoff Des 2027, Jan 2028 penuh 12", () => {
    expect(leaveYear("2026-02-10", "2026-09-24")).toEqual({ start: "2026-02-10", end: "2026-12-31", eligibleFrom: null, serviceYears: 0, prorateMonths: 0 });
    expect(entitlementOf("2026-02-10", "2026-09-24")).toBe(0);

    expect(leaveYear("2026-02-10", "2027-05-01")).toEqual({ start: "2027-01-01", end: "2027-12-31", eligibleFrom: "2027-02-10", serviceYears: 1, prorateMonths: 10 });
    expect(entitlementOf("2026-02-10", "2027-05-01")).toBe(10);

    expect(leaveYear("2026-02-10", "2028-01-02")).toEqual({ start: "2028-01-01", end: "2028-12-31", eligibleFrom: "2028-01-01", serviceYears: 1, prorateMonths: 12 });
    expect(entitlementOf("2026-02-10", "2028-01-02")).toBe(12);
  });

  it("contoh user: masuk Des 2026 → Des 2027 tidak dapat (cutoff), Januari 2028 baru dapat", () => {
    expect(leaveYear("2026-12-07", "2027-12-20")).toMatchObject({ eligibleFrom: null, prorateMonths: 0 });
    expect(entitlementOf("2026-12-07", "2027-12-20")).toBe(0);
    expect(firstUsableDate("2026-12-07")).toBe("2028-01-01");
    expect(entitlementOf("2026-12-07", "2028-03-01")).toBe(12);
  });

  it("bulan genap 1 tahun tidak dihitung: Jan → 11, Nov → 1", () => {
    expect(entitlementOf("2026-01-01", "2027-03-01")).toBe(11);
    expect(leaveYear("2026-01-01", "2027-03-01")).toMatchObject({ eligibleFrom: "2027-01-01", serviceYears: 1 });
    expect(entitlementOf("2026-11-20", "2027-12-01")).toBe(1);
    expect(firstUsableDate("2026-11-20")).toBe("2027-11-20");
  });

  it("naik tingkat mulai Januari setelah genap 6 / 16 tahun", () => {
    // Masuk Mar 2020: genap 6 tahun Mar 2026 → 2026 masih 12, 2027 menjadi 15.
    expect(entitlementOf("2020-03-15", "2026-11-01")).toBe(12);
    expect(entitlementOf("2020-03-15", "2027-01-05")).toBe(15);
    // Masuk Jan 2010: per 1 Jan 2026 = 16 tahun → 18.
    expect(entitlementOf("2010-01-04", "2026-06-01")).toBe(15);
    expect(entitlementOf("2010-01-01", "2026-06-01")).toBe(18);
  });

  it("rehire di tengah tahun: periode mulai tanggal rehire, belum bisa cuti", () => {
    expect(leaveYear("2027-01-04", "2027-06-01")).toEqual({ start: "2027-01-04", end: "2027-12-31", eligibleFrom: null, serviceYears: 0, prorateMonths: 0 });
  });
});

describe("hari kerja (LV-05)", () => {
  it("tanpa Sabtu & Minggu", () => {
    // 21 Sep 2026 = Senin … 27 Sep = Minggu
    expect(countWorkingDays("2026-09-21", "2026-09-27", new Set())).toBe(5);
    expect(countWorkingDays("2026-09-26", "2026-09-27", new Set())).toBe(0);
  });

  it("tanpa hari libur", () => {
    expect(countWorkingDays("2026-09-21", "2026-09-25", new Set(["2026-09-23", "2026-09-26"]))).toBe(4);
  });

  it("rentang satu hari & lintas bulan", () => {
    expect(countWorkingDays("2026-09-24", "2026-09-24", new Set())).toBe(1);
    expect(countWorkingDays("2026-09-28", "2026-10-02", new Set())).toBe(5);
  });
});

describe("saldo & carry over (LV-03, OI-02)", () => {
  it("sisa = jatah + carry − terpakai − pending", () => {
    expect(remainingDays({ entitlement: 12, carriedOver: 3, used: 5 }, 2)).toBe(8);
  });

  it.each([
    [{ entitlement: 12, carriedOver: 0, used: 0 }, 3], // sisa 12 → maks 3
    [{ entitlement: 12, carriedOver: 0, used: 10 }, 2],
    [{ entitlement: 12, carriedOver: 3, used: 2 }, 3], // carry lama habis dulu, sisa jatah 12
    [{ entitlement: 12, carriedOver: 3, used: 14 }, 1], // 3 dari carry + 11 dari jatah → sisa jatah 1
    [{ entitlement: 12, carriedOver: 3, used: 15 }, 0],
    [{ entitlement: 0, carriedOver: 0, used: 0 }, 0],
  ])("%o → carry berikutnya %i", (balance, expected) => {
    expect(nextCarryOver(balance, 3)).toBe(expected);
  });
});
