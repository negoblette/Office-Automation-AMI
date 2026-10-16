import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { approveRequest } from "@/lib/services/approval";
import { addCertificate, deleteCertificate, updateCertificate } from "@/lib/services/certificate";
import { addDocument } from "@/lib/services/document";
import { getEmployeeCertificates } from "@/lib/services/employee-queries";
import { canAccessFile, prismaFileAccessRepository } from "@/lib/services/file-access";
import { certificateSchema } from "@/lib/validators/certificate";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const actors: Record<string, Actor> = {};

beforeEach(async () => {
  u = await resetAndSeed();
  for (const [key, id] of Object.entries(u)) {
    const user = await testDb.user.findUniqueOrThrow({ where: { id } });
    actors[key] = { id: user.id, role: user.role, employeeId: user.employeeId };
  }
});

afterAll(async () => {
  await testDb.$disconnect();
});

const input = (overrides: Record<string, unknown> = {}) =>
  certificateSchema.parse({
    type: "PROFESSIONAL",
    name: "Cisco CCNA",
    issuer: "Cisco",
    level: "2",
    startDate: "2024-03-01",
    endDate: "2027-03-01",
    fileKey: `${randomUUID()}.pdf`,
    ...overrides,
  });

const requestOf = (certificateId: string) =>
  testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "CERTIFICATE", entityId: certificateId } }, include: { steps: { orderBy: { level: "asc" } } } });

describe("certificateSchema", () => {
  const issues = (values: Record<string, unknown>) =>
    certificateSchema.safeParse(values).error?.issues.map((i) => [i.path.join("."), i.message]) ?? [];

  it("profesional (2026-10-12): level wajib; masa berlaku wajib kecuali dicentang Permanent", () => {
    const base = { type: "PROFESSIONAL", name: "CCNA", startDate: "2024-01-01" };
    expect(issues({ ...base, endDate: "" })).toEqual([
      ["level", "Level wajib dipilih"],
      ["endDate", 'Masa berlaku wajib diisi, atau centang "Tidak ada masa berlaku / Permanent"'],
    ]);
    expect(issues({ ...base, level: "1", endDate: "2023-12-31" })).toEqual([["endDate", "Tanggal berakhir tidak boleh sebelum tanggal diambil"]]);
    expect(certificateSchema.parse({ ...base, level: "3", endDate: "2027-01-01", noExpiry: true })).toMatchObject({ level: 3, endDate: null, degree: null });
    expect(certificateSchema.parse({ ...base, level: "1", endDate: "2027-01-01" })).toMatchObject({ level: 1, endDate: "2027-01-01" });
    // Bug 2026-10-13: hasil parse dikirim ulang ke server dan di-parse lagi → harus tetap lolos.
    for (const raw of [{ ...base, level: "2", noExpiry: true }, { ...base, level: "3", endDate: "2027-01-01" }]) {
      const once = certificateSchema.parse(raw);
      expect(certificateSchema.parse(once)).toEqual(once);
    }
  });

  it("ijazah (2026-10-12): gelar, lembaga, jenjang, tanggal mulai & lulus; tanpa masa berlaku", () => {
    const base = { type: "IJAZAH", name: "Sarjana Komputer" };
    expect(issues(base)).toEqual([
      ["issuer", "Lembaga wajib diisi"],
      ["degree", "Jenjang wajib dipilih"],
      ["graduationDate", "Tanggal lulus wajib diisi"],
    ]);
    // 2026-10-16: ijazah tanpa tanggal mulai — tanggal disimpan = tanggal lulus.
    expect(certificateSchema.parse({ ...base, issuer: "UI", degree: "S1", graduationDate: "2016-01-01" })).toMatchObject({ startDate: "2016-01-01" });
    expect(certificateSchema.parse({ ...base, issuer: "UI", degree: "S1", graduationDate: "2020-08-01", endDate: "2030-01-01", level: "2" })).toMatchObject({
      degree: "S1",
      graduationDate: "2020-08-01",
      endDate: null,
      level: null,
    });
  });
});

describe("verifikasi sertifikat (2026-10-12): Ci Ika", () => {
  it("staf menambah sertifikat → nomor CRT, menunggu Ci Ika → Terverifikasi", async () => {
    const certificate = await addCertificate(testDb, actors.andi, actors.andi.employeeId!, input());
    expect(certificate).toMatchObject({ status: "PENDING", verificationNumber: expect.stringMatching(/^CRT\/\d{4}\/\d{2}\/0001$/) });
    expect(certificate.notifications[0]).toMatchObject({ template: "approval-requested", recipientIds: [u.ika] });
    expect(await testDb.auditLog.count({ where: { entityId: certificate.id, action: "CREATE" } })).toBe(1);

    const request = await requestOf(certificate.id);
    await expect(approveRequest(testDb, { requestId: request.id, actorId: u.yosep })).rejects.toThrow("tidak berhak");
    await approveRequest(testDb, { requestId: request.id, actorId: u.ika });
    const [view] = await getEmployeeCertificates(testDb, actors.andi.employeeId!);
    expect(view.verification).toBe("APPROVED");
  });

  it("sertifikat milik Ci Ika → Fallback (Ko Rudy / Ko Leonard)", async () => {
    const certificate = await addCertificate(testDb, actors.ika, actors.ika.employeeId!, input());
    expect([...certificate.notifications[0].recipientIds].sort()).toEqual([u.rudy, u.leonard].sort());
  });

  it("Approver boleh membuka file sertifikat yang ia verifikasi; staf lain tidak", async () => {
    // Alur Ci Ika: Ko Yosep (Approver, tidak tercantum) tidak boleh; Ci Ika boleh.
    const certificate = await addCertificate(testDb, actors.andi, actors.andi.employeeId!, input());
    const owner = await prismaFileAccessRepository(testDb).findFileOwner(certificate.fileKey!);
    expect(owner?.approverIds).toEqual([u.ika]);
    expect(canAccessFile({ id: u.yosep, role: "APPROVER", employeeId: actors.yosep.employeeId }, owner!)).toBe(false);
    expect(canAccessFile({ id: u.ika, role: "ADMIN", employeeId: actors.ika.employeeId }, owner!)).toBe(true);
    expect(canAccessFile({ id: u.sinta, role: "STAFF", employeeId: actors.sinta.employeeId }, owner!)).toBe(false);
  });

  it("setelah terverifikasi staf tidak bisa mengubah; Admin bisa. Staf lain tidak berhak", async () => {
    const certificate = await addCertificate(testDb, actors.andi, actors.andi.employeeId!, input());
    await expect(updateCertificate(testDb, actors.sinta, certificate.id, input())).rejects.toThrow("Anda tidak berhak");
    await expect(updateCertificate(testDb, actors.andi, certificate.id, input({ name: "CCNA v2", fileKey: certificate.fileKey }))).resolves.toMatchObject({ oldFileKey: null, notifications: [] });

    const request = await requestOf(certificate.id);
    await approveRequest(testDb, { requestId: request.id, actorId: u.ika });
    await expect(updateCertificate(testDb, actors.andi, certificate.id, input({ fileKey: certificate.fileKey }))).rejects.toThrow("sudah terverifikasi");
    await expect(updateCertificate(testDb, actors.ika, certificate.id, input({ name: "CCNP", fileKey: certificate.fileKey }))).resolves.toMatchObject({ oldFileKey: null });
  });

  it("2026-10-16: ijazah langsung tersimpan tanpa approval dan tetap bisa diubah pemiliknya", async () => {
    const ijazah = await addCertificate(
      testDb,
      actors.andi,
      actors.andi.employeeId!,
      certificateSchema.parse({ type: "IJAZAH", name: "Sarjana Komputer", issuer: "UI", degree: "S1", graduationDate: "2020-08-01", fileKey: `${randomUUID()}.pdf` }),
    );
    expect(ijazah).toMatchObject({ status: "APPROVED", verificationNumber: null, notifications: [] });
    expect(await testDb.approvalRequest.count({ where: { entityId: ijazah.id } })).toBe(0);
    await expect(
      updateCertificate(testDb, actors.andi, ijazah.id, certificateSchema.parse({ type: "IJAZAH", name: "Sarjana Teknik", issuer: "UI", degree: "S1", graduationDate: "2020-08-01", fileKey: ijazah.fileKey })),
    ).resolves.toMatchObject({ notifications: [] });
  });

  it("hapus sertifikat yang masih menunggu → soft delete + verifikasi dibatalkan (keluar dari antrian)", async () => {
    const certificate = await addCertificate(testDb, actors.andi, actors.andi.employeeId!, input());
    await deleteCertificate(testDb, actors.andi, certificate.id);
    expect((await testDb.certificate.findUniqueOrThrow({ where: { id: certificate.id } })).deletedAt).not.toBeNull();
    expect(await getEmployeeCertificates(testDb, actors.andi.employeeId!)).toEqual([]);
    expect((await requestOf(certificate.id)).status).toBe("REJECTED");
  });

  it("file yang sudah dipakai dokumen lain tidak bisa diklaim", async () => {
    const sintaDoc = await addDocument(testDb, actors.sinta, {
      employeeId: actors.sinta.employeeId!,
      docType: "KTP",
      fileKey: `${randomUUID()}.pdf`,
      fileName: "ktp.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
    });
    await expect(addCertificate(testDb, actors.andi, actors.andi.employeeId!, input({ fileKey: sintaDoc.fileKey }))).rejects.toThrow("File sudah dipakai");
  });
});
