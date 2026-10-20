import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addFamilyMember } from "@/lib/services/document";
import { updateSelf } from "@/lib/services/employee";
import { findEmployeeByNik, type PersonalDataAccess, viewPersonalData } from "@/lib/services/personal-data-access";
import { employeeSelfSchema } from "@/lib/validators/employee";
import { familyMemberSchema } from "@/lib/validators/family";
import { createTestEmployee, resetDb, testDb } from "@/test/db";

const access: PersonalDataAccess = { reason: "Cek NIK salah ketik, tiket #12", operator: "Engineer A", host: "server-1" };
let andi: { employeeId: string; userId: string };

beforeEach(async () => {
  await resetDb();
  andi = await createTestEmployee({ fullName: "Andi Pratama", email: "andi@test.local" });
  await updateSelf(
    testDb,
    andi.userId,
    andi.employeeId,
    employeeSelfSchema.parse({ maritalStatus: "MARRIED", nik: "3171012345678901", phone: "081234567890", birthDate: "1990-05-17" }),
  );
});

afterAll(async () => {
  await testDb.$disconnect();
});

const viewLogs = () => testDb.auditLog.findMany({ where: { action: "VIEW_PERSONAL_DATA" }, orderBy: { createdAt: "asc" } });

describe("alat engineer (hardening Tahap 4)", () => {
  it("data:lihat menampilkan data asli beserta keluarga, dan mencatat audit (alasan, operator, host)", async () => {
    const actor = { id: andi.userId, role: "STAFF" as const, employeeId: andi.employeeId };
    await addFamilyMember(testDb, actor, andi.employeeId, familyMemberSchema.parse({ relation: "CHILD", fullName: "Budi", nik: "3171011203180003", birthDate: "2018-03-12" }));

    const data = await viewPersonalData(testDb, "ANDI@test.local", access);

    expect(data).toMatchObject({ id: andi.employeeId, fullName: "Andi Pratama", status: "ACTIVE" });
    expect(data.personal).toMatchObject({ nik: "3171012345678901", phone: "+6281234567890", birthDate: "1990-05-17" });
    expect(data.family).toEqual([{ relation: "CHILD", fullName: "Budi", nik: "3171011203180003", birthDate: "2018-03-12" }]);
    const [log] = await viewLogs();
    expect(log).toMatchObject({
      userId: null,
      entity: "Employee",
      entityId: andi.employeeId,
      after: { alat: "data:lihat", alasan: access.reason, oleh: "Engineer A", host: "server-1" },
    });
  });

  it("tanpa alasan yang cukup atau nama operator → ditolak, tidak ada yang dibuka atau dicatat", async () => {
    await expect(viewPersonalData(testDb, "andi@test.local", { ...access, reason: "cek" })).rejects.toThrow("Alasan wajib diisi");
    await expect(viewPersonalData(testDb, "andi@test.local", { ...access, operator: " " })).rejects.toThrow("--oleh");
    await expect(viewPersonalData(testDb, "tidak-ada@test.local", access)).rejects.toThrow("Karyawan tidak ditemukan");
    expect(await viewLogs()).toEqual([]);
  });

  it("data:cari-nik menemukan karyawan lewat sidik jari NIK; NIK yang dicari tidak ikut tercatat", async () => {
    await expect(findEmployeeByNik(testDb, "3171 0123 4567 8901", access)).resolves.toMatchObject({ id: andi.employeeId, fullName: "Andi Pratama" });
    await expect(findEmployeeByNik(testDb, "3171012345678902", access)).resolves.toBeNull();
    await expect(findEmployeeByNik(testDb, "12345", access)).rejects.toThrow("NIK harus 16 digit angka");

    const logs = await viewLogs();
    expect(logs.map((log) => (log.after as { alat: string; ditemukan: boolean }).ditemukan)).toEqual([true, false]);
    expect(JSON.stringify(logs)).not.toContain("3171012345678901");
    expect(JSON.stringify(logs)).not.toContain("3171012345678902");
  });
});
