import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAsset, updateAsset } from "@/lib/services/asset";
import { listAssets } from "@/lib/services/asset-queries";
import { setUserActive } from "@/lib/services/user-admin";
import { getOperationalUserIds, inventoryAccess, OPERATIONAL_USERS_KEY, saveOperationalUsers } from "@/lib/services/inventory-access";
import { createRack, deleteRack, listRacks, updateRack } from "@/lib/services/storage-rack";
import { assetSchema } from "@/lib/validators/asset";
import { rackSchema } from "@/lib/validators/inventory";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;

beforeEach(async () => {
  u = await resetAndSeed();
});

afterAll(async () => {
  await testDb.$disconnect();
});

const actor = async (key: string) => {
  const user = await testDb.user.findUniqueOrThrow({ where: { id: u[key] } });
  return { id: user.id, role: user.role, employeeId: user.employeeId };
};
const access = async (key: string) => inventoryAccess(testDb, await actor(key));
const rack = (name: string, columns = 4, rows = 5) => rackSchema.parse({ name, columns, rows, note: "" });
const unit = (serialNo: string, rackId: string | null = null, rackPosition: string | null = null) =>
  assetSchema.parse({ deviceName: "SFP+ (10G)", serialNo, category: "DEMO_UNIT", rackId: rackId ?? "", rackPosition: rackPosition ?? "" });

describe("hak akses Inventory (2026-11-17)", () => {
  it("Admin & divisi Engineer/Sales bisa melihat; mengelola hanya Admin & Operational", async () => {
    expect(await access("ika")).toEqual({ canView: true, canManage: true, isOperational: false }); // Admin divisi Umum
    expect(await access("andi")).toEqual({ canView: true, canManage: false, isOperational: false }); // Staf Engineer
    expect(await access("sinta")).toEqual({ canView: true, canManage: false, isOperational: false }); // Staf Sales
    expect(await access("darwin")).toMatchObject({ canView: true, canManage: false }); // Approver Sales
    expect(await access("devi")).toEqual({ canView: false, canManage: false, isOperational: false }); // Staf Umum

    // Devi ditunjuk Operational → bisa melihat & mengelola.
    await saveOperationalUsers(testDb, u.ika, { userIds: [u.devi, u.devi, u.andi] });
    expect(await getOperationalUserIds(testDb)).toEqual([u.devi, u.andi]);
    expect(await access("devi")).toEqual({ canView: true, canManage: true, isOperational: true });
    expect(await access("andi")).toMatchObject({ canManage: true, isOperational: true });
    expect(await testDb.auditLog.count({ where: { entity: "AppSetting", entityId: OPERATIONAL_USERS_KEY } })).toBe(1);

    // Karyawan Engineer yang resign tidak bisa lagi (Operational tetap ditentukan daftar).
    const sinta = await testDb.user.findUniqueOrThrow({ where: { id: u.sinta } });
    await testDb.employee.update({ where: { id: sinta.employeeId! }, data: { status: "RESIGNED" } });
    expect(await access("sinta")).toMatchObject({ canView: false });
  });

  it("Operational hanya user aktif yang ada", async () => {
    await setUserActive(testDb, u.ika, u.devi, false);
    await expect(saveOperationalUsers(testDb, u.ika, { userIds: [u.devi] })).rejects.toThrow("Hanya user aktif");
    await expect(saveOperationalUsers(testDb, u.ika, { userIds: ["tidak-ada"] })).rejects.toThrow("tidak ditemukan");
    expect(await getOperationalUserIds(testDb)).toEqual([]);
  });
});

describe("rak & lokasi unit (2026-11-17)", () => {
  it("nama unik tanpa beda huruf; rak terhapus dipulihkan saat ditambah lagi", async () => {
    const r1 = await createRack(testDb, u.ika, rack("Rak 1"));
    await expect(createRack(testDb, u.ika, rack("rak 1"))).rejects.toThrow("Nama rak sudah dipakai");
    const r2 = await createRack(testDb, u.ika, rack("Rak 2"));
    await expect(updateRack(testDb, u.ika, r2.id, rack("RAK 1"))).rejects.toThrow("Nama rak sudah dipakai");

    await deleteRack(testDb, u.ika, r1.id);
    expect((await listRacks(testDb)).map((r) => r.name)).toEqual(["Rak 2"]);
    const restored = await createRack(testDb, u.ika, rack("Rak 1", 2, 3));
    expect(restored.id).toBe(r1.id);
    expect(restored).toMatchObject({ columns: 2, rows: 3, deletedAt: null });

    await createRack(testDb, u.ika, rack("Rak 10"));
    expect((await listRacks(testDb)).map((r) => r.name)).toEqual(["Rak 1", "Rak 2", "Rak 10"]); // urut alami
  });

  it("unit disimpan di posisi yang ada; satu posisi boleh banyak unit", async () => {
    const r = await createRack(testDb, u.ika, rack("Rak 1", 4, 5));
    await createAsset(testDb, u.ika, unit("MUE00YP", r.id, "A1"));
    await createAsset(testDb, u.ika, unit("MUJ203Z", r.id, "A1"));
    await expect(createAsset(testDb, u.ika, unit("MUH2UJ9", r.id, "E1"))).rejects.toThrow("Posisi tidak ada di Rak 1");
    await expect(createAsset(testDb, u.ika, unit("MUH2UJ9", "rak-tidak-ada", "A1"))).rejects.toThrow("Rak tidak ditemukan");

    const rows = (await listAssets(testDb)).sort((x, y) => x.serialNo.localeCompare(y.serialNo));
    expect(rows.map((a) => [a.serialNo, a.rackName, a.rackPosition])).toEqual([
      ["MUE00YP", "Rak 1", "A1"],
      ["MUJ203Z", "Rak 1", "A1"],
    ]);
    expect((await listRacks(testDb))[0].assetCount).toBe(2);
  });

  it("rak berisi unit tidak bisa dihapus atau diperkecil melewati posisi terpakai", async () => {
    const r = await createRack(testDb, u.ika, rack("Rak 1", 4, 5));
    const a = await createAsset(testDb, u.ika, unit("MUE00YP", r.id, "D5"));
    await expect(deleteRack(testDb, u.ika, r.id)).rejects.toThrow("Rak masih berisi 1 unit");
    await expect(updateRack(testDb, u.ika, r.id, rack("Rak 1", 3, 5))).rejects.toThrow("Masih ada unit di posisi D5");
    await expect(updateRack(testDb, u.ika, r.id, rack("Rak 1", 4, 6))).resolves.toMatchObject({ rows: 6 }); // diperbesar boleh

    // Unit dikeluarkan dari rak → rak bisa dihapus.
    await updateAsset(testDb, u.ika, a.id, unit("MUE00YP"));
    expect((await testDb.asset.findUniqueOrThrow({ where: { id: a.id } })).rackPosition).toBeNull();
    await deleteRack(testDb, u.ika, r.id);
    expect(await listRacks(testDb)).toEqual([]);
    expect(await testDb.auditLog.count({ where: { entity: "StorageRack", entityId: r.id } })).toBe(3); // create, update, delete
  });
});
