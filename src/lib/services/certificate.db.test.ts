import { getEmployeeCertificates } from "@/lib/services/employee-queries";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { addCertificate, deleteCertificate, updateCertificate } from "@/lib/services/certificate";
import { addDocument } from "@/lib/services/document";
import { certificateSchema } from "@/lib/validators/certificate";
import { createTestEmployee, resetDb, testDb } from "@/test/db";

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

const input = (overrides: Record<string, unknown> = {}) =>
  certificateSchema.parse({
    type: "PROFESSIONAL",
    name: "Cisco CCNA",
    issuer: "Cisco",
    number: "",
    startDate: "2024-03-01",
    endDate: "2027-03-01",
    fileKey: `${randomUUID()}.pdf`,
    ...overrides,
  });

describe("certificateSchema", () => {
  it("end date kosong = seumur hidup; end < start ditolak", () => {
    expect(input({ endDate: "" }).endDate).toBeNull();
    const result = certificateSchema.safeParse({ type: "IJAZAH", name: "S1", startDate: "2020-01-01", endDate: "2019-12-31" });
    expect(result.error?.issues[0]).toMatchObject({ path: ["endDate"], message: "Tanggal berakhir tidak boleh sebelum tanggal terbit" });
  });
});

describe("sertifikat", () => {
  it("staf menambah sertifikat sendiri; tercatat di audit", async () => {
    const certificate = await addCertificate(testDb, andi, andi.employeeId!, input());
    expect(certificate).toMatchObject({ employeeId: andi.employeeId, name: "Cisco CCNA", number: null });
    expect(await testDb.auditLog.count({ where: { entityId: certificate.id, action: "CREATE" } })).toBe(1);
  });

  it("staf tidak bisa mengubah sertifikat karyawan lain; Admin bisa", async () => {
    const certificate = await addCertificate(testDb, andi, andi.employeeId!, input());
    await expect(updateCertificate(testDb, sinta, certificate.id, input())).rejects.toThrow("Anda tidak berhak");
    await expect(updateCertificate(testDb, admin, certificate.id, input({ name: "CCNP", fileKey: certificate.fileKey }))).resolves.toBeNull();
  });

  it("file yang sudah dipakai dokumen lain tidak bisa diklaim", async () => {
    const sintaDoc = await addDocument(testDb, sinta, {
      employeeId: sinta.employeeId!,
      docType: "KTP",
      fileKey: `${randomUUID()}.pdf`,
      fileName: "ktp.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
    });
    await expect(addCertificate(testDb, andi, andi.employeeId!, input({ fileKey: sintaDoc.fileKey }))).rejects.toThrow(
      "File sudah dipakai",
    );
  });

  it("ganti file mengembalikan key lama; simpan tanpa ganti file → null", async () => {
    const certificate = await addCertificate(testDb, andi, andi.employeeId!, input());
    await expect(updateCertificate(testDb, andi, certificate.id, input({ fileKey: certificate.fileKey }))).resolves.toBeNull();
    await expect(updateCertificate(testDb, andi, certificate.id, input())).resolves.toBe(certificate.fileKey);
  });

  it("hapus = soft delete (data & file tetap ada, tidak tampil lagi)", async () => {
    const certificate = await addCertificate(testDb, andi, andi.employeeId!, input());
    await deleteCertificate(testDb, andi, certificate.id);
    expect((await testDb.certificate.findUniqueOrThrow({ where: { id: certificate.id } })).deletedAt).not.toBeNull();
    expect(await getEmployeeCertificates(testDb, andi.employeeId!)).toEqual([]);
  });
});
