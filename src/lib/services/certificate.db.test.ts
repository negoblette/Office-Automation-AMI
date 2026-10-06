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
    number: "",
    startDate: "2024-03-01",
    endDate: "2027-03-01",
    fileKey: `${randomUUID()}.pdf`,
    ...overrides,
  });

const requestOf = (certificateId: string) =>
  testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "CERTIFICATE", entityId: certificateId } }, include: { steps: { orderBy: { level: "asc" } } } });

describe("certificateSchema", () => {
  it("masa berlaku opsional (profesional & ijazah); berlaku < diambil ditolak", () => {
    expect(certificateSchema.parse({ type: "PROFESSIONAL", name: "CCNA", startDate: "2024-01-01", endDate: "" }).endDate).toBeNull();
    expect(certificateSchema.parse({ type: "IJAZAH", name: "S1", startDate: "2020-01-01", endDate: "" }).endDate).toBeNull();
    const result = certificateSchema.safeParse({ type: "IJAZAH", name: "S1", startDate: "2020-01-01", endDate: "2019-12-31" });
    expect(result.error?.issues[0]).toMatchObject({ path: ["endDate"], message: "Tanggal berakhir tidak boleh sebelum tanggal diambil" });
  });
});

describe("verifikasi sertifikat (Fase 14): Ko Yosep → Bu Ika", () => {
  it("staf menambah sertifikat → nomor CRT, menunggu Ko Yosep; setelah Yosep & Ika → Terverifikasi", async () => {
    const certificate = await addCertificate(testDb, actors.andi, actors.andi.employeeId!, input());
    expect(certificate).toMatchObject({ status: "PENDING", verificationNumber: expect.stringMatching(/^CRT\/\d{4}\/\d{2}\/0001$/) });
    expect(certificate.notifications[0]).toMatchObject({ template: "approval-requested", recipientIds: [u.yosep] });
    expect(await testDb.auditLog.count({ where: { entityId: certificate.id, action: "CREATE" } })).toBe(1);

    const request = await requestOf(certificate.id);
    await expect(approveRequest(testDb, { requestId: request.id, actorId: u.ika })).rejects.toThrow("tidak berhak");
    await approveRequest(testDb, { requestId: request.id, actorId: u.yosep });
    await approveRequest(testDb, { requestId: request.id, actorId: u.ika });
    const [view] = await getEmployeeCertificates(testDb, actors.andi.employeeId!);
    expect(view.verification).toBe("APPROVED");
  });

  it("sertifikat yang di-input Ko Yosep langsung ke Bu Ika", async () => {
    const certificate = await addCertificate(testDb, actors.yosep, actors.yosep.employeeId!, input());
    const request = await requestOf(certificate.id);
    expect(request.steps.map((s) => [s.level, s.status])).toEqual([
      [1, "SKIPPED"],
      [2, "PENDING"],
    ]);
    expect(request.steps[1].approverIds).toEqual([u.ika]);
  });

  it("Approver (Ko Yosep) boleh membuka file sertifikat yang ia verifikasi; staf lain tidak", async () => {
    const certificate = await addCertificate(testDb, actors.andi, actors.andi.employeeId!, input());
    const owner = await prismaFileAccessRepository(testDb).findFileOwner(certificate.fileKey!);
    expect(canAccessFile({ id: u.yosep, role: "APPROVER", employeeId: actors.yosep.employeeId }, owner!)).toBe(true);
    expect(canAccessFile({ id: u.sinta, role: "STAFF", employeeId: actors.sinta.employeeId }, owner!)).toBe(false);
  });

  it("setelah terverifikasi staf tidak bisa mengubah; Admin bisa. Staf lain tidak berhak", async () => {
    const certificate = await addCertificate(testDb, actors.andi, actors.andi.employeeId!, input());
    await expect(updateCertificate(testDb, actors.sinta, certificate.id, input())).rejects.toThrow("Anda tidak berhak");
    await expect(updateCertificate(testDb, actors.andi, certificate.id, input({ name: "CCNA v2", fileKey: certificate.fileKey }))).resolves.toBeNull();

    const request = await requestOf(certificate.id);
    await approveRequest(testDb, { requestId: request.id, actorId: u.yosep });
    await approveRequest(testDb, { requestId: request.id, actorId: u.ika });
    await expect(updateCertificate(testDb, actors.andi, certificate.id, input({ fileKey: certificate.fileKey }))).rejects.toThrow("sudah terverifikasi");
    await expect(updateCertificate(testDb, actors.ika, certificate.id, input({ name: "CCNP", fileKey: certificate.fileKey }))).resolves.toBeNull();
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
