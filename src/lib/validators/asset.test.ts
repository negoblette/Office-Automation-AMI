import { describe, expect, it } from "vitest";
import { assetBatchSchema, expandUnitRows, MAX_UNITS_PER_FORM, splitSerials } from "./asset";

const row = (overrides: Record<string, unknown> = {}) => ({ deviceName: "SFP+ 10G", category: "DEMO_UNIT", quantity: 1, serials: "", ...overrides });
const issues = (units: Record<string, unknown>[]) => {
  const result = assetBatchSchema.safeParse({ units });
  return result.success ? [] : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);
};

describe("baris unit dengan jumlah (2026-11-25)", () => {
  it("serial number: satu per baris, koma / titik koma / tab juga pemisah, UPPERCASE, baris kosong dibuang", () => {
    expect(splitSerials(" sn-1 \r\nsn-2,sn-3;\tsn-4\n\n")).toEqual(["SN-1", "SN-2", "SN-3", "SN-4"]);
  });

  it("jumlah: bilangan bulat 1–50 (isian teks dari form ikut dibaca); draft lama tanpa jumlah = 1", () => {
    expect(assetBatchSchema.parse({ units: [row({ quantity: "3" })] }).units[0].quantity).toBe(3);
    expect(assetBatchSchema.parse({ units: [row({ quantity: undefined })] }).units[0].quantity).toBe(1);
    expect(issues([row({ quantity: "" })])).toEqual([["units.0.quantity", "Jumlah minimal 1"]]);
    expect(issues([row({ quantity: "1.5" })])).toEqual([["units.0.quantity", "Jumlah harus bilangan bulat"]]);
    expect(issues([row({ quantity: 51 })])).toEqual([
      ["units.0.quantity", `Jumlah maksimal ${MAX_UNITS_PER_FORM}`],
      ["units", "Maksimal 50 unit sekali daftar — sekarang 51 unit"],
    ]);
  });

  it("serial number per baris: tidak lebih banyak dari jumlah, tidak dobel, 3–50 karakter", () => {
    expect(issues([row({ quantity: 1, serials: "A01\nA02" })])).toEqual([
      ["units.0.serials", "Ada 2 serial number, lebih banyak dari jumlah (1). Naikkan jumlah atau kurangi serial number."],
    ]);
    expect(issues([row({ quantity: 3, serials: "A01\na01" })])).toEqual([["units.0.serials", "Serial number A01 ditulis dua kali"]]);
    expect(issues([row({ quantity: 2, serials: "A01\nAB" })])).toEqual([["units.0.serials", "Serial number AB harus 3–50 karakter"]]);
  });

  it("antarbaris: serial dobel ditandai di baris kedua; total unit semua baris maksimal 50", () => {
    expect(issues([row({ quantity: 2, serials: "A01\nA02" }), row({ quantity: 2, serials: "B01\na02" })])).toEqual([
      ["units.1.serials", "Serial number A02 sudah ada di baris 1"],
    ]);
    expect(issues([row({ quantity: 30 }), row({ quantity: 21 })])).toEqual([["units", "Maksimal 50 unit sekali daftar — sekarang 51 unit"]]);
  });

  it("baris → unit satu per satu: serial berurutan, sisa unit tanpa S/N, posisi rak ikut", () => {
    const { units } = assetBatchSchema.parse({
      units: [row({ quantity: 3, serials: "a01\na02", rackId: "rak-1", rackPosition: "b2" }), row({ deviceName: "Switch" })],
    });
    expect(expandUnitRows(units).map(({ rowIndex, unit }) => [rowIndex, unit.deviceName, unit.serialNo, unit.rackPosition])).toEqual([
      [0, "SFP+ 10G", "A01", "B2"],
      [0, "SFP+ 10G", "A02", "B2"],
      [0, "SFP+ 10G", null, "B2"],
      [1, "Switch", null, null],
    ]);
  });
});
