import { describe, expect, it } from "vitest";
import { certificateStatus, daysUntil } from "@/lib/certificate-status";

describe("certificateStatus (CERT-02)", () => {
  const today = "2026-09-24";

  it.each([
    [null, "LIFETIME"],
    ["2027-09-24", "ACTIVE"],
    ["2026-10-25", "ACTIVE"], // 31 hari lagi
    ["2026-10-24", "EXPIRING"], // tepat 30 hari lagi
    ["2026-09-25", "EXPIRING"],
    ["2026-09-24", "EXPIRING"], // hari terakhir berlaku
    ["2026-09-23", "EXPIRED"],
    ["2020-01-01", "EXPIRED"],
  ] as const)("end date %s → %s", (endDate, expected) => {
    expect(certificateStatus(endDate, today)).toBe(expected);
  });

  it("daysUntil tahan pergantian bulan & tahun kabisat", () => {
    expect(daysUntil("2028-03-01", "2028-02-28")).toBe(2);
    expect(daysUntil("2026-09-01", "2026-09-24")).toBe(-23);
  });
});
