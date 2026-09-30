import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addCandidateDocument, convertCandidate, deleteCandidate, saveCandidate } from "@/lib/services/candidate";
import { resignEmployee, updateSelf } from "@/lib/services/employee";
import { candidateSchema, convertCandidateSchema } from "@/lib/validators/candidate";
import { employeeSelfSchema } from "@/lib/validators/employee";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;

beforeEach(async () => {
  u = await resetAndSeed();
});

afterAll(async () => {
  await testDb.$disconnect();
});

const candidate = (overrides: Record<string, unknown> = {}) =>
  candidateSchema.parse({
    fullName: "rian pratama",
    email: "Rian@Test.local",
    phone: "0812-1111-2222",
    nik: "3171012345678999",
    appliedPosition: "Network Engineer",
    status: "APPLIED",
    notes: "",
    ...overrides,
  });
const convert = (overrides: Record<string, unknown> = {}) =>
  convertCandidateSchema.parse({ division: "ENGINEER", position: "Network Engineer", startDate: "2026-10-01", role: "STAFF", password: "Awal12345", ...overrides });
const doc = (candidateId: string, docType = "KTP") => ({
  candidateId,
  docType: docType as "KTP",
  fileKey: `${randomUUID()}.pdf`,
  fileName: `${docType}.pdf`,
  mimeType: "application/pdf",
  sizeBytes: 10,
});

describe("kandidat (CAN-01..03)", () => {
  it("konversi Diterima → karyawan: data disalin, dokumen pindah, akun bisa login, kandidat terkunci", async () => {
    const c = await saveCandidate(testDb, u.yosep, null, candidate());
    await addCandidateDocument(testDb, u.yosep, doc(c.id, "KTP"));
    await addCandidateDocument(testDb, u.yosep, doc(c.id, "IJAZAH_TRANSKRIP"));

    await expect(convertCandidate(testDb, u.yosep, c.id, convert())).rejects.toThrow("Hanya kandidat berstatus Diterima");
    await saveCandidate(testDb, u.yosep, c.id, candidate({ status: "ACCEPTED" }));

    const { employeeId, movedDocuments } = await convertCandidate(testDb, u.yosep, c.id, convert());
    expect(movedDocuments).toBe(2);

    const employee = await testDb.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { user: true, documents: true, periods: true } });
    expect(employee).toMatchObject({ fullName: "Rian Pratama", email: "rian@test.local", nik: "3171012345678999", phone: "+6281211112222", division: "ENGINEER" });
    expect(employee.documents.map((d) => [d.ownerType, d.candidateId])).toEqual([
      ["EMPLOYEE", null],
      ["EMPLOYEE", null],
    ]);
    expect(await argon2.verify(employee.user!.passwordHash, "Awal12345")).toBe(true);
    expect(employee.periods[0].startDate.toISOString()).toBe("2026-10-01T00:00:00.000Z");

    expect((await testDb.candidate.findUniqueOrThrow({ where: { id: c.id } })).convertedEmployeeId).toBe(employeeId);
    await expect(convertCandidate(testDb, u.yosep, c.id, convert())).rejects.toThrow("sudah menjadi karyawan");
    await expect(saveCandidate(testDb, u.yosep, c.id, candidate({ status: "REJECTED" }))).rejects.toThrow("tidak bisa diubah");
    await expect(deleteCandidate(testDb, u.yosep, c.id)).rejects.toThrow("tidak bisa dihapus");
  });

  it("NIK sudah dipakai karyawan resign → arahkan ke Aktifkan kembali; transaksi batal utuh", async () => {
    const andi = await testDb.user.findUniqueOrThrow({ where: { id: u.andi } });
    await updateSelf(testDb, u.andi, andi.employeeId!, employeeSelfSchema.parse({ fullName: "Andi Pratama", position: "Engineer", maritalStatus: "SINGLE", nik: "3171012345678999" }));
    await resignEmployee(testDb, u.yosep, andi.employeeId!, "2026-09-30");

    const c = await saveCandidate(testDb, u.yosep, null, candidate({ status: "ACCEPTED" }));
    await addCandidateDocument(testDb, u.yosep, doc(c.id));
    await expect(convertCandidate(testDb, u.yosep, c.id, convert())).rejects.toThrow('Gunakan "Aktifkan kembali" di Arsip Karyawan');
    // Tidak ada karyawan baru & dokumen tetap milik kandidat.
    expect(await testDb.employee.count({ where: { email: "rian@test.local" } })).toBe(0);
    expect(await testDb.document.count({ where: { candidateId: c.id } })).toBe(1);
  });

  it("email yang sudah dipakai karyawan ditolak saat konversi", async () => {
    const c = await saveCandidate(testDb, u.yosep, null, candidate({ email: "andi@artha-mitra.local", nik: "", status: "ACCEPTED" }));
    await expect(convertCandidate(testDb, u.yosep, c.id, convert())).rejects.toThrow("Email sudah dipakai karyawan lain");
  });

  it("hapus kandidat = soft delete beserta dokumennya; dokumen keluarga tidak berlaku untuk kandidat", async () => {
    const c = await saveCandidate(testDb, u.yosep, null, candidate());
    const d = await addCandidateDocument(testDb, u.yosep, doc(c.id));
    await expect(addCandidateDocument(testDb, u.yosep, doc(c.id, "KTP_PASANGAN"))).rejects.toThrow("tidak berlaku untuk kandidat");
    await deleteCandidate(testDb, u.yosep, c.id);
    // Data tidak dihapus permanen (NFR v1.14), hanya ditandai terhapus.
    expect(await testDb.document.count({ where: { id: d.id, deletedAt: { not: null } } })).toBe(1);
    expect(await testDb.candidate.count({ where: { id: c.id, deletedAt: { not: null } } })).toBe(1);
    await expect(deleteCandidate(testDb, u.yosep, c.id)).rejects.toThrow("tidak ditemukan");
  });
});
