// Daftar Unit dikelompokkan per rak (2026-11-19): urutan rak alami, posisi fisik, "Tidak di rak" terakhir.
import { describe, expect, it } from "vitest";
import { NO_RACK_GROUP, rackGroupComparator, rackGroupKey, sortUnitsByRack } from "./inventory";

const unit = (rackId: string | null, rackName: string | null, rackPosition: string | null, deviceName: string, serialNo = "SN") => ({
  rackId,
  rackName,
  rackPosition,
  deviceName,
  serialNo,
});

describe("urutan Daftar Unit per rak", () => {
  it("rak urut alami, posisi seperti susunan fisik, lalu nama & serial; tanpa rak di akhir", () => {
    const units = [
      unit(null, null, null, "Kabel"),
      unit("r10", "Rak 10", "A1", "Router"),
      unit("r2", "Rak 2", "B1", "Switch"),
      unit("r2", "Rak 2", "A10", "SFP", "SN2"),
      unit("r2", "Rak 2", "A2", "SFP", "SN9"),
      unit("r2", "Rak 2", "A2", "SFP", "SN1"),
      unit("r1", "rak 1", "A1", "Access Point"),
    ];
    expect(sortUnitsByRack(units).map((u) => `${u.rackName ?? "-"} ${u.rackPosition ?? "-"} ${u.deviceName} ${u.serialNo}`)).toEqual([
      "rak 1 A1 Access Point SN",
      "Rak 2 A2 SFP SN1",
      "Rak 2 A2 SFP SN9",
      "Rak 2 A10 SFP SN2",
      "Rak 2 B1 Switch SN",
      "Rak 10 A1 Router SN",
      "- - Kabel SN",
    ]);
    expect(units[0].deviceName).toBe("Kabel"); // array asal tidak diubah
  });

  it("unit dengan rak tapi tanpa posisi ikut kelompok Tidak di rak (sama dengan filter Lokasi)", () => {
    expect(rackGroupKey({ rackId: "r1", rackPosition: null })).toBe(NO_RACK_GROUP);
    expect(rackGroupKey({ rackId: "r1", rackPosition: "A1" })).toBe("r1");
    const compare = rackGroupComparator((key) => ({ r1: "Rak 1", r2: "Rak 2" })[key] ?? "");
    expect(["r2", NO_RACK_GROUP, "r1"].sort(compare)).toEqual(["r1", "r2", NO_RACK_GROUP]);
  });
});
