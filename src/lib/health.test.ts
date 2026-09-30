import { describe, expect, it } from "vitest";
import { nextMonth, remainingPlafond } from "@/lib/health";

describe("nextMonth", () => {
  it("lintas tahun", () => {
    expect(nextMonth("2026-09")).toBe("2026-10");
    expect(nextMonth("2026-12")).toBe("2027-01");
  });
});

describe("sisa plafon tahunan (HC-07)", () => {
  it("plafon − klaim disetujui/menunggu", () => {
    expect(remainingPlafond(10_000_000, 2_500_000)).toBe(7_500_000);
  });
});
