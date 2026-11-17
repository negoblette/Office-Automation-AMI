import { describe, expect, it } from "vitest";
import { isPositionInRack, parseRackPosition, rackLocationLabel, rackPositions, rackRangeLabel } from "@/lib/inventory";
import { assetSchema } from "@/lib/validators/asset";
import { rackSchema } from "@/lib/validators/inventory";

describe("posisi rak (2026-11-17)", () => {
  it("posisi = huruf kolom + nomor baris, urut per baris", () => {
    expect(rackPositions(3, 2)).toEqual(["A1", "B1", "C1", "A2", "B2", "C2"]);
    expect(rackPositions(26, 50)).toHaveLength(1300);
    expect(rackRangeLabel({ columns: 4, rows: 5 })).toBe("A1–D5");
  });

  it("membaca & memeriksa posisi", () => {
    expect(parseRackPosition("C12")).toEqual({ column: 2, row: 12 });
    for (const bad of ["", "1A", "AA1", "A0", "a1", "A100"]) expect(parseRackPosition(bad)).toBeNull();
    expect(isPositionInRack("D5", { columns: 4, rows: 5 })).toBe(true);
    expect(isPositionInRack("E1", { columns: 4, rows: 5 })).toBe(false);
    expect(isPositionInRack("A6", { columns: 4, rows: 5 })).toBe(false);
  });

  it("label lokasi", () => {
    expect(rackLocationLabel("Rak 1", "A1")).toBe("Rak 1 · A1");
    expect(rackLocationLabel(null, null)).toBeNull();
    expect(rackLocationLabel("Rak 1", null)).toBeNull();
  });

  it("validasi rak & lokasi unit", () => {
    expect(rackSchema.parse({ name: " Rak 1 ", columns: "4", rows: "5", note: "" })).toEqual({ name: "Rak 1", columns: 4, rows: 5, note: null });
    expect(rackSchema.safeParse({ name: "Rak", columns: 27, rows: 5 }).error?.issues[0].message).toBe("Jumlah kolom maksimal 26");
    expect(rackSchema.safeParse({ name: "Rak", columns: 4, rows: 0 }).error?.issues[0].message).toBe("Jumlah baris minimal 1");

    const base = { deviceName: "SFP+ (10G)", serialNo: "mue00yp", category: "DEMO_UNIT" };
    expect(assetSchema.parse({ ...base, rackId: "r1", rackPosition: " b3 " })).toMatchObject({ rackId: "r1", rackPosition: "B3" });
    expect(assetSchema.parse({ ...base, rackId: "", rackPosition: "" })).toMatchObject({ rackId: null, rackPosition: null });
    expect(assetSchema.safeParse({ ...base, rackId: "r1", rackPosition: "" }).error?.issues[0].message).toBe("Posisi di rak wajib dipilih");
    expect(assetSchema.safeParse({ ...base, rackId: "", rackPosition: "A1" }).error?.issues[0].message).toBe("Rak wajib dipilih");
    expect(assetSchema.safeParse({ ...base, rackId: "r1", rackPosition: "1A" }).error?.issues[0].message).toBe("Posisi tidak valid (contoh: A1)");
  });
});
