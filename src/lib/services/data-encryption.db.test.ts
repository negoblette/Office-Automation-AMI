import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptText, encryptedKeyId, isEncryptedValue, nikIndex } from "@/lib/crypto/field-encryption";
import { isEncryptedFile } from "@/lib/crypto/file-encryption";
import { encryptPersonalData } from "@/lib/services/data-encryption";
import { openCandidate, openEmployee, openFamilyMember, openJson, openLines } from "@/lib/services/personal-data";
import { LocalStorage } from "@/lib/storage/local";
import { createTestEmployee, resetDb, testDb } from "@/test/db";

const T1 = process.env.DATA_ENCRYPTION_KEYS!;
const T2 = "t2:EVcgw0svJPvdbAFKd4L6jx4vtLX3cRuv4AMGc+8K1/0=";

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await testDb.$disconnect();
});

/** Data sebelum Tahap 4: nilai masih terbuka dan nikHash kosong (ditulis langsung tanpa seal). */
async function legacyData() {
  const andi = await createTestEmployee({ fullName: "Andi", email: "andi@test.local" });
  await testDb.employee.update({
    where: { id: andi.employeeId },
    data: { nik: "3171012345678901", birthDate: "1990-05-17", phone: "+6281234567890", emergencyName: "Siti Aminah", maritalStatus: "MARRIED" },
  });
  const member = await testDb.familyMember.create({
    data: { employeeId: andi.employeeId, relation: "CHILD", fullName: "Budi", nik: "3171011203180003", birthDate: "2018-03-12" },
  });
  const candidate = await testDb.candidate.create({
    data: { fullName: "Rian", email: "rian@test.local", nik: "3171017001990005", phone: "+6281211112222", appliedPosition: "Engineer" },
  });
  const change = await testDb.profileChangeRequest.create({
    data: {
      number: "PRF/2026/10/0001",
      employeeId: andi.employeeId,
      kind: "SELF_DATA",
      payload: { nik: "3171012345678999" },
      summary: ["NIK: 3171012345678901 → 3171012345678999"],
      requestedById: andi.userId,
    },
  });
  return { andi, member, candidate, change };
}

describe("encryptPersonalData (npm run data:encrypt)", () => {
  it("--cek hanya menghitung, tidak ada yang diubah", async () => {
    const { andi } = await legacyData();

    const report = await encryptPersonalData(testDb, { dryRun: true });

    expect(report).toMatchObject({ dryRun: true, keyId: "t1", files: { total: 0, changed: 0 } });
    expect(report.tables).toEqual([
      { table: "Employee", rows: 1, changedRows: 1, changedValues: 5 }, // 4 kolom + nikHash
      { table: "FamilyMember", rows: 1, changedRows: 1, changedValues: 2 },
      { table: "Candidate", rows: 1, changedRows: 1, changedValues: 2 },
      { table: "ProfileChangeRequest", rows: 1, changedRows: 1, changedValues: 2 },
    ]);
    expect(await testDb.employee.findUniqueOrThrow({ where: { id: andi.employeeId } })).toMatchObject({ nik: "3171012345678901", nikHash: null });
  });

  it("data lama dikunci, nikHash diisi, isi & updatedAt tetap; aman dijalankan ulang", async () => {
    const { andi, member, candidate, change } = await legacyData();
    const before = await testDb.employee.findUniqueOrThrow({ where: { id: andi.employeeId } });

    await encryptPersonalData(testDb);

    const employee = await testDb.employee.findUniqueOrThrow({ where: { id: andi.employeeId } });
    for (const value of [employee.nik, employee.birthDate, employee.phone, employee.emergencyName]) expect(isEncryptedValue(value!)).toBe(true);
    expect(employee.nikHash).toBe(nikIndex("3171012345678901"));
    expect(employee.updatedAt).toEqual(before.updatedAt);
    expect(openEmployee(employee)).toMatchObject({ nik: "3171012345678901", birthDate: "1990-05-17", phone: "+6281234567890", emergencyName: "Siti Aminah" });

    const rawMember = await testDb.familyMember.findUniqueOrThrow({ where: { id: member.id } });
    expect(isEncryptedValue(rawMember.nik!)).toBe(true);
    expect(openFamilyMember(rawMember)).toMatchObject({ nik: "3171011203180003", birthDate: "2018-03-12" });

    const rawCandidate = await testDb.candidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(isEncryptedValue(rawCandidate.phone!)).toBe(true);
    expect(openCandidate(rawCandidate)).toMatchObject({ nik: "3171017001990005", phone: "+6281211112222" });

    const rawChange = await testDb.profileChangeRequest.findUniqueOrThrow({ where: { id: change.id } });
    expect(JSON.stringify([rawChange.payload, rawChange.summary])).not.toContain("3171012345678");
    expect(openJson(rawChange.payload)).toEqual({ nik: "3171012345678999" });
    expect(openLines(rawChange.summary)).toEqual(["NIK: 3171012345678901 → 3171012345678999"]);

    const again = await encryptPersonalData(testDb);
    expect(again.tables.map((table) => table.changedRows)).toEqual([0, 0, 0, 0]);
  });

  it("rotasi: kunci baru di depan → semua nilai dikunci ulang dengan kunci baru, isinya tetap", async () => {
    const { andi } = await legacyData();
    await encryptPersonalData(testDb);

    vi.stubEnv("DATA_ENCRYPTION_KEYS", `${T2},${T1}`);
    const report = await encryptPersonalData(testDb);
    expect(report.keyId).toBe("t2");
    expect(report.tables[0]).toMatchObject({ changedRows: 1, changedValues: 4 }); // nikHash tidak berubah

    const employee = await testDb.employee.findUniqueOrThrow({ where: { id: andi.employeeId } });
    expect(encryptedKeyId(employee.nik!)).toBe("t2");
    // Setelah dikunci ulang, data tetap terbuka walau kunci lama sudah tidak ada.
    vi.stubEnv("DATA_ENCRYPTION_KEYS", T2);
    expect(decryptText(employee.nik)).toBe("3171012345678901");
  });

  it("kunci yang salah (id sama, isi lain) → proses gagal, sehingga deploy berhenti", async () => {
    await legacyData();
    await encryptPersonalData(testDb);

    vi.stubEnv("DATA_ENCRYPTION_KEYS", `t1:${T2.slice(3)}`);
    await expect(encryptPersonalData(testDb)).rejects.toThrow("tidak bisa dibuka");
  });

  it("file upload: file lama dikunci, file berkunci aktif dilewati, sisa file sementara dibersihkan", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "oa-encrypt-"));
    try {
      const legacyKey = "0b8f7c1e-2f3a-4c5d-9e8f-0123456789ab.pdf";
      const content = new TextEncoder().encode("%PDF-1.7\nscan KTP lama");
      await writeFile(path.join(dir, legacyKey), content);
      await new LocalStorage(dir).put(content, "pdf");
      await writeFile(path.join(dir, `.${legacyKey}.sisa.tmp`), "x");

      expect((await encryptPersonalData(testDb, { uploadDir: dir })).files).toEqual({ total: 2, changed: 1 });
      expect(isEncryptedFile(await readFile(path.join(dir, legacyKey)))).toBe(true);
      expect(new Uint8Array(await new LocalStorage(dir).get(legacyKey))).toEqual(content);
      expect((await readdir(dir)).some((name) => name.endsWith(".tmp"))).toBe(false);
      expect((await encryptPersonalData(testDb, { uploadDir: dir })).files).toEqual({ total: 2, changed: 0 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
