import { describe, expect, it } from "vitest";
import { leavePolicySettingSchema, leaveRequestSchema, parseHolidayLines } from "@/lib/validators/leave";

describe("leaveRequestSchema", () => {
  it("selesai sebelum mulai ditolak", () => {
    const result = leaveRequestSchema.safeParse({ startDate: "2026-10-05", endDate: "2026-10-04", reason: "Liburan" });
    expect(result.error?.issues[0]).toMatchObject({ path: ["endDate"] });
  });
});

describe("parseHolidayLines", () => {
  it("baris valid & nomor baris yang salah", () => {
    expect(parseHolidayLines("2027-01-01 Tahun Baru\n\n2027-13-01 Salah\nbukan tanggal\n2027-02-06  Imlek ")).toEqual({
      holidays: [
        { date: "2027-01-01", name: "Tahun Baru" },
        { date: "2027-02-06", name: "Imlek" },
      ],
      invalidLines: [3, 4],
    });
  });
});

describe("leavePolicySettingSchema", () => {
  const valid = {
    policies: [
      { minYears: "0", maxYears: "0", days: "0" },
      { minYears: "1", maxYears: "5", days: "12" },
      { minYears: "6", maxYears: "15", days: "15" },
      { minYears: "16", maxYears: "", days: "18" },
    ],
    maxCarryOver: "3",
  };

  it("valid: angka dari form dikonversi, batas atas terakhir kosong = null", () => {
    expect(leavePolicySettingSchema.parse(valid)).toEqual({
      policies: [
        { minYears: 0, maxYears: 0, days: 0 },
        { minYears: 1, maxYears: 5, days: 12 },
        { minYears: 6, maxYears: 15, days: 15 },
        { minYears: 16, maxYears: null, days: 18 },
      ],
      maxCarryOver: 3,
    });
  });

  it("celah rentang ditolak", () => {
    const result = leavePolicySettingSchema.safeParse({ ...valid, policies: [valid.policies[0], { ...valid.policies[2] }, valid.policies[3]] });
    expect(result.error?.issues[0]).toMatchObject({ path: ["policies", 1, "minYears"], message: "Harus 1 (lanjutan baris sebelumnya)" });
  });

  it("baris terakhir harus tanpa batas atas", () => {
    const result = leavePolicySettingSchema.safeParse({ ...valid, policies: [...valid.policies.slice(0, 3), { minYears: "16", maxYears: "40", days: "18" }] });
    expect(result.error?.issues[0]).toMatchObject({ path: ["policies", 3, "maxYears"] });
  });
});
