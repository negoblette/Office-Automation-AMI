import { describe, expect, it } from "vitest";
import { groupLoanItems, loanItemGroupText, snSuffix } from "./demo-loan";
import { snLabel } from "./inventory";

describe("unit tanpa serial number (2026-11-25)", () => {
  it("dikelompokkan per part number: unit tanpa S/N ikut dihitung, serialnya tidak ditulis", () => {
    const groups = groupLoanItems([
      { deviceName: "Switch", serialNo: "SW1" },
      { deviceName: "SFP", serialNo: null },
      { deviceName: "Switch", serialNo: null },
      { deviceName: "SFP", serialNo: null },
    ]);
    expect(groups).toEqual([
      { deviceName: "Switch", quantity: 2, serials: ["SW1"] },
      { deviceName: "SFP", quantity: 2, serials: [] },
    ]);
    expect(groups.map(loanItemGroupText)).toEqual(["Switch ×2 — SN SW1", "SFP ×2"]);
  });

  it("label serial: kosong → Tanpa S/N / tanpa sufiks", () => {
    expect([snLabel("SW1"), snLabel(null)]).toEqual(["SN SW1", "Tanpa S/N"]);
    expect([snSuffix("SW1"), snSuffix(null)]).toEqual([" · SN SW1", ""]);
  });
});
