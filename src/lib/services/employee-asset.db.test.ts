import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { updateSelf } from "@/lib/services/employee";
import { deleteEmployeeAsset, listEmployeeAssetItems, saveEmployeeAsset } from "@/lib/services/employee-asset";
import { employeeAssetSchema } from "@/lib/validators/employee-asset";
import { employeeSelfSchema } from "@/lib/validators/employee";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
let andiEmployeeId: string;

beforeEach(async () => {
  u = await resetAndSeed();
  andiEmployeeId = (await testDb.user.findUniqueOrThrow({ where: { id: u.andi } })).employeeId!;
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("aset karyawan (Fase 14)", () => {
  it("Admin mencatat aset; yang masih dipegang tampil di atas; hapus = soft delete", async () => {
    const laptop = await saveEmployeeAsset(testDb, u.ika, andiEmployeeId, null, employeeAssetSchema.parse({ name: "Laptop T14", serialNo: "pf3abc", receivedDate: "2025-01-10", returnedDate: "", note: "" }));
    await saveEmployeeAsset(testDb, u.ika, andiEmployeeId, null, employeeAssetSchema.parse({ name: "Monitor", serialNo: "", receivedDate: "2024-01-10", returnedDate: "2024-12-31", note: "" }));
    const list = await listEmployeeAssetItems(testDb, andiEmployeeId);
    expect(list.map((a) => [a.name, a.serialNo, a.returnedDate])).toEqual([
      ["Laptop T14", "PF3ABC", null],
      ["Monitor", null, "2024-12-31"],
    ]);
    await deleteEmployeeAsset(testDb, u.ika, laptop.id);
    expect((await listEmployeeAssetItems(testDb, andiEmployeeId)).map((a) => a.name)).toEqual(["Monitor"]);
    expect(await testDb.employeeAsset.count()).toBe(2);
  });

  it("tanggal kembali sebelum tanggal terima ditolak", () => {
    expect(() => employeeAssetSchema.parse({ name: "Laptop", receivedDate: "2025-01-10", returnedDate: "2025-01-01" })).toThrow("Tanggal kembali");
  });
});

describe("NIP & kontak darurat (Fase 14)", () => {
  it("staf mengisi kontak darurat sendiri; NIP yang dikirim staf diabaikan", async () => {
    await testDb.employee.update({ where: { id: andiEmployeeId }, data: { employeeNo: "AMI-001" } });
    const input = employeeSelfSchema.parse({
      fullName: "Andi Pratama",
      position: "Engineer",
      maritalStatus: "SINGLE",
      employeeNo: "HACK-1",
      emergencyName: "budi pratama",
      emergencyRelation: "Kakak",
      emergencyPhone: "0812-3456-7890",
    });
    const after = await updateSelf(testDb, u.andi, andiEmployeeId, input);
    expect([after.employeeNo, after.emergencyName, after.emergencyPhone]).toEqual(["AMI-001", "Budi Pratama", "+6281234567890"]);
  });
});
