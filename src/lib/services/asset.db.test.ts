import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { assignAsset, createAsset, deleteAsset, returnAsset, updateAsset } from "@/lib/services/asset";
import { resignEmployee } from "@/lib/services/employee";
import { assetSchema, assignAssetSchema, returnAssetSchema } from "@/lib/validators/asset";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const emp: Record<string, string> = {};

beforeEach(async () => {
  u = await resetAndSeed();
  for (const [key, id] of Object.entries(u)) emp[key] = (await testDb.user.findUniqueOrThrow({ where: { id } })).employeeId!;
});

afterAll(async () => {
  await testDb.$disconnect();
});

const asset = (overrides: Record<string, unknown> = {}) =>
  assetSchema.parse({ deviceName: "Cisco Router 2901", serialNo: " cs-2901-x7718a ", category: "DEMO_UNIT", supportEnd: "2027-03-01", supportStart: "2025-03-01", ...overrides });
const assign = (employeeKey: string, assignedAt = "2026-09-01") => assignAssetSchema.parse({ employeeId: emp[employeeKey], assignedAt, note: "POC klien" });
const giveBack = (returnedAt = "2026-09-20") => returnAssetSchema.parse({ returnedAt, note: "" });

describe("aset (INV-01)", () => {
  it("serial dirapikan UPPERCASE & harus unik; akhir support ≥ awal", async () => {
    const created = await createAsset(testDb, u.yosep, asset());
    expect(created.serialNo).toBe("CS-2901-X7718A");
    await expect(createAsset(testDb, u.yosep, asset({ serialNo: "CS-2901-x7718a" }))).rejects.toThrow("Serial number sudah terdaftar");
    expect(assetSchema.safeParse({ ...asset(), supportEnd: "2024-01-01" }).error?.issues[0].message).toBe("Akhir support tidak boleh sebelum awalnya");
    await expect(updateAsset(testDb, u.yosep, created.id, asset({ deviceName: "Cisco Router 2911" }))).resolves.toMatchObject({ deviceName: "Cisco Router 2911" });
  });
});

describe("serah terima (INV-02)", () => {
  it("pinjam → kembali → pinjam ke orang lain; riwayat tersimpan", async () => {
    const a = await createAsset(testDb, u.yosep, asset());
    await assignAsset(testDb, u.yosep, a.id, assign("andi"));
    await expect(assignAsset(testDb, u.yosep, a.id, assign("sinta"))).rejects.toThrow("Aset masih dipegang Andi Pratama");

    await returnAsset(testDb, u.yosep, a.id, giveBack());
    await expect(returnAsset(testDb, u.yosep, a.id, giveBack())).rejects.toThrow("Aset sedang tidak dipinjam");
    await expect(assignAsset(testDb, u.yosep, a.id, assign("sinta", "2026-09-10"))).rejects.toThrow("tidak boleh sebelum pengembalian terakhir");
    await assignAsset(testDb, u.yosep, a.id, assign("sinta", "2026-09-21"));

    const history = await testDb.assetAssignment.findMany({ where: { assetId: a.id }, orderBy: { assignedAt: "asc" }, include: { employee: true } });
    expect(history.map((h) => [h.employee.fullName, h.returnedAt !== null])).toEqual([
      ["Andi Pratama", true],
      ["Sinta Lestari", false],
    ]);
    await expect(deleteAsset(testDb, u.yosep, a.id)).rejects.toThrow("tidak bisa dihapus");
  });

  it("tanggal kembali tidak boleh sebelum tanggal serah; karyawan resign tidak bisa menerima", async () => {
    const a = await createAsset(testDb, u.yosep, asset());
    await assignAsset(testDb, u.yosep, a.id, assign("andi"));
    await expect(returnAsset(testDb, u.yosep, a.id, giveBack("2026-08-31"))).rejects.toThrow("tidak boleh sebelum tanggal serah");

    const b = await createAsset(testDb, u.yosep, asset({ serialNo: "BIO-X100" }));
    await resignEmployee(testDb, u.yosep, emp.devi, "2026-09-15");
    await expect(assignAsset(testDb, u.yosep, b.id, assign("devi"))).rejects.toThrow("Hanya bisa diserahkan ke karyawan aktif");
  });

  it("dua serah terima bersamaan → hanya satu yang berhasil", async () => {
    const a = await createAsset(testDb, u.yosep, asset());
    const results = await Promise.allSettled([assignAsset(testDb, u.yosep, a.id, assign("andi")), assignAsset(testDb, u.yosep, a.id, assign("sinta"))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("aset tanpa riwayat bisa dihapus", async () => {
    const a = await createAsset(testDb, u.yosep, asset());
    await deleteAsset(testDb, u.yosep, a.id);
    expect(await testDb.asset.count({ where: { deletedAt: null } })).toBe(0);
    expect(await testDb.asset.count()).toBe(1); // soft delete
  });
});
