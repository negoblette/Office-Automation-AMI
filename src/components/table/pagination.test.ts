import { describe, expect, it } from "vitest";
import { describeRange, getPageNumbers } from "@/components/table/pagination";
import { requestStatusBadge } from "@/components/shared/approval-status";

describe("getPageNumbers", () => {
  it("halaman sedikit → semua ditampilkan", () => {
    expect(getPageNumbers(1, 1)).toEqual([1]);
    expect(getPageNumbers(2, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("halaman banyak → ringkas dengan elipsis", () => {
    expect(getPageNumbers(1, 25)).toEqual([1, 2, "…", 25]);
    expect(getPageNumbers(5, 25)).toEqual([1, "…", 4, 5, 6, "…", 25]);
    expect(getPageNumbers(25, 25)).toEqual([1, "…", 24, 25]);
    expect(getPageNumbers(3, 25)).toEqual([1, 2, 3, 4, "…", 25]);
  });

  it("tanpa data → kosong", () => {
    expect(getPageNumbers(1, 0)).toEqual([]);
  });
});

describe("describeRange", () => {
  it("rentang baris halaman aktif", () => {
    expect(describeRange(0, 10, 148, "karyawan")).toBe("Menampilkan 1–10 dari 148 karyawan");
    expect(describeRange(14, 10, 148, "karyawan")).toBe("Menampilkan 141–148 dari 148 karyawan");
  });

  it("tanpa data", () => {
    expect(describeRange(0, 10, 0)).toBe("Tidak ada data");
  });
});

describe("requestStatusBadge (RMB-09)", () => {
  it.each([
    ["DRAFT", null, "Draft", "neutral"],
    ["PENDING", 1, "Menunggu L1", "pending"],
    ["PENDING", 2, "Menunggu L2", "pending"],
    ["APPROVED", null, "Disetujui", "success"],
    ["REJECTED", null, "Ditolak", "danger"],
  ] as const)("%s (level %s) → %s", (status, level, label, variant) => {
    expect(requestStatusBadge(status, level)).toEqual({ label, variant });
  });
});
