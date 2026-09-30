import { getEmployeeDocuments } from "@/lib/services/employee-queries";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  type Actor,
  addDocument,
  addFamilyMember,
  deleteDocument,
  deleteFamilyMember,
  type NewDocument,
} from "@/lib/services/document";
import { createTestEmployee, resetDb, testDb } from "@/test/db";
import { familyMemberSchema } from "@/lib/validators/family";

let admin: Actor;
let andi: Actor;
let sinta: Actor;

beforeEach(async () => {
  await resetDb();
  const a = await createTestEmployee({ fullName: "Yosep", email: "yosep@test.local", role: "ADMIN" });
  const b = await createTestEmployee({ fullName: "Andi", email: "andi@test.local" });
  const c = await createTestEmployee({ fullName: "Sinta", email: "sinta@test.local" });
  admin = { id: a.userId, role: "ADMIN", employeeId: a.employeeId };
  andi = { id: b.userId, role: "STAFF", employeeId: b.employeeId };
  sinta = { id: c.userId, role: "STAFF", employeeId: c.employeeId };
});

afterAll(async () => {
  await testDb.$disconnect();
});

const newKey = () => `${randomUUID()}.pdf`;
const doc = (owner: Actor, overrides: Partial<NewDocument> = {}): NewDocument => ({
  employeeId: owner.employeeId!,
  docType: "KTP",
  fileKey: newKey(),
  fileName: "ktp.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1234,
  ...overrides,
});
const member = (relation: "SPOUSE" | "CHILD", fullName: string) => familyMemberSchema.parse({ relation, fullName });
const setMarital = (actor: Actor, maritalStatus: "SINGLE" | "MARRIED" | "DIVORCED") =>
  testDb.employee.update({ where: { id: actor.employeeId! }, data: { maritalStatus } });

describe("hak akses", () => {
  it("staf boleh menambah dokumen miliknya; Admin boleh untuk siapa pun", async () => {
    await expect(addDocument(testDb, andi, doc(andi))).resolves.toMatchObject({ ownerType: "EMPLOYEE", uploadedById: andi.id });
    await expect(addDocument(testDb, admin, doc(andi, { docType: "KK" }))).resolves.toMatchObject({ uploadedById: admin.id });
  });

  it("staf tidak boleh menambah/menghapus dokumen karyawan lain", async () => {
    await expect(addDocument(testDb, sinta, doc(andi))).rejects.toThrow("Anda tidak berhak mengubah data karyawan ini");
    const document = await addDocument(testDb, andi, doc(andi));
    await expect(deleteDocument(testDb, sinta, document.id)).rejects.toThrow("Anda tidak berhak");
  });

  it("key file yang sudah dipakai data lain tidak bisa diklaim", async () => {
    const sintaDoc = await addDocument(testDb, sinta, doc(sinta));
    await expect(addDocument(testDb, andi, doc(andi, { fileKey: sintaDoc.fileKey }))).rejects.toThrow(
      "File sudah dipakai, silakan upload ulang",
    );
  });
});

describe("aturan dokumen keluarga (DOC-02)", () => {
  it("belum menikah: tidak bisa menambah keluarga atau surat nikah", async () => {
    await expect(addFamilyMember(testDb, andi, andi.employeeId!, member("CHILD", "Budi"))).rejects.toThrow(
      "Ubah status pernikahan di Data Diri terlebih dahulu",
    );
    await expect(addDocument(testDb, andi, doc(andi, { docType: "SURAT_NIKAH_CERAI" }))).rejects.toThrow(
      "Surat nikah/cerai hanya untuk status selain Belum menikah",
    );
  });

  it("menikah: satu pasangan + beberapa anak; dokumen sesuai hubungan", async () => {
    await setMarital(andi, "MARRIED");
    const spouse = await addFamilyMember(testDb, andi, andi.employeeId!, member("SPOUSE", "rina"));
    expect(spouse.fullName).toBe("Rina");
    await expect(addFamilyMember(testDb, andi, andi.employeeId!, member("SPOUSE", "Lain"))).rejects.toThrow(
      "Data suami/istri sudah ada",
    );
    const child = await addFamilyMember(testDb, andi, andi.employeeId!, member("CHILD", "Budi"));

    await expect(
      addDocument(testDb, andi, doc(andi, { docType: "KTP_PASANGAN", familyMemberId: spouse.id })),
    ).resolves.toMatchObject({ ownerType: "FAMILY", employeeId: andi.employeeId, familyMemberId: spouse.id });
    await expect(
      addDocument(testDb, andi, doc(andi, { docType: "KTP_PASANGAN", familyMemberId: child.id })),
    ).rejects.toThrow("Jenis dokumen tidak sesuai dengan anggota keluarga");
    await expect(addDocument(testDb, andi, doc(andi, { docType: "AKTE_KELAHIRAN_ANAK" }))).rejects.toThrow(
      "Dokumen ini harus ditautkan ke anggota keluarga",
    );
  });

  it("cerai: anak boleh, pasangan tidak", async () => {
    await setMarital(andi, "DIVORCED");
    await expect(addFamilyMember(testDb, andi, andi.employeeId!, member("CHILD", "Budi"))).resolves.toBeTruthy();
    await expect(addFamilyMember(testDb, andi, andi.employeeId!, member("SPOUSE", "Rina"))).rejects.toThrow(
      "Data suami/istri hanya untuk status Menikah",
    );
  });

  it("anggota keluarga milik karyawan lain tidak bisa dipakai", async () => {
    await setMarital(sinta, "MARRIED");
    const sintaChild = await addFamilyMember(testDb, sinta, sinta.employeeId!, member("CHILD", "Tono"));
    await setMarital(andi, "MARRIED");
    await expect(
      addDocument(testDb, andi, doc(andi, { docType: "AKTE_KELAHIRAN_ANAK", familyMemberId: sintaChild.id })),
    ).rejects.toThrow("Data keluarga tidak ditemukan");
  });
});

describe("hapus", () => {
  it("hapus dokumen = soft delete & tercatat di audit", async () => {
    const document = await addDocument(testDb, andi, doc(andi));
    await deleteDocument(testDb, andi, document.id);
    expect(await testDb.document.count({ where: { deletedAt: null } })).toBe(0);
    expect(await testDb.document.count()).toBe(1);
    const actions = (await testDb.auditLog.findMany({ where: { entityId: document.id } })).map((l) => l.action);
    expect(actions.sort()).toEqual(["CREATE", "DELETE"]);
  });

  it("hapus anggota keluarga ikut menghapus dokumennya", async () => {
    await setMarital(andi, "MARRIED");
    const child = await addFamilyMember(testDb, andi, andi.employeeId!, member("CHILD", "Budi"));
    const akte = await addDocument(testDb, andi, doc(andi, { docType: "AKTE_KELAHIRAN_ANAK", familyMemberId: child.id }));

    await deleteFamilyMember(testDb, andi, child.id);
    expect(await testDb.familyMember.count({ where: { deletedAt: null } })).toBe(0);
    expect(await testDb.document.count({ where: { id: akte.id, deletedAt: { not: null } } })).toBe(1);
    // Setelah dihapus, anak baru bisa ditambahkan lagi dan dokumen lama tidak ikut terhitung.
    const docs = await getEmployeeDocuments(testDb, andi.employeeId!);
    expect(docs?.family).toEqual([]);
  });
});
