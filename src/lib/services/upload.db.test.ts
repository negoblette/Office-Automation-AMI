import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { addDocument, deleteDocument } from "@/lib/services/document";
import { purgeOrphanFiles, registerUpload, UPLOAD_QUOTA, uploadQuotaError } from "@/lib/services/upload";
import { pdfActiveContent, validateUpload } from "@/lib/storage/validate";
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

const newKey = () => `${randomUUID()}.pdf`;
const ktp = (owner: Actor, fileKey: string) => ({
  employeeId: owner.employeeId!,
  docType: "KTP" as const,
  fileKey,
  fileName: "ktp.pdf",
  mimeType: "application/pdf",
  sizeBytes: 10,
});

describe("file hanya bisa ditautkan pengunggahnya (hardening Tahap 7)", () => {
  it("key upload orang lain / key tanpa catatan upload ditolak; upload sendiri boleh (Admin untuk karyawan lain juga)", async () => {
    const andiKey = newKey();
    await registerUpload(testDb, u.andi, andiKey, 10);
    await expect(addDocument(testDb, actors.sinta, ktp(actors.sinta, andiKey))).rejects.toThrow("bukan upload Anda");
    await expect(addDocument(testDb, actors.andi, ktp(actors.andi, newKey()))).rejects.toThrow("bukan upload Anda");
    await expect(addDocument(testDb, actors.andi, ktp(actors.andi, andiKey))).resolves.toMatchObject({ fileKey: andiKey });

    const adminKey = newKey();
    await registerUpload(testDb, u.ika, adminKey, 10);
    await expect(addDocument(testDb, actors.ika, { ...ktp(actors.andi, adminKey), docType: "KK" })).resolves.toMatchObject({ fileKey: adminKey });
  });
});

describe("kuota upload per orang (hardening Tahap 7)", () => {
  it(`maks ${UPLOAD_QUOTA.filesPerHour} file per jam dan ${UPLOAD_QUOTA.bytesPerDay / 1024 / 1024} MB per hari; orang lain tidak terpengaruh`, async () => {
    const now = new Date();
    for (let i = 0; i < UPLOAD_QUOTA.filesPerHour - 1; i++) await registerUpload(testDb, u.andi, newKey(), 1000);
    expect(await uploadQuotaError(testDb, u.andi, 1000, now)).toBeNull();
    await registerUpload(testDb, u.andi, newKey(), 1000);
    expect(await uploadQuotaError(testDb, u.andi, 1000, now)).toContain("file per jam");
    expect(await uploadQuotaError(testDb, u.sinta, 1000, now)).toBeNull();
    // Satu jam lagi: batas per jam terbuka kembali.
    expect(await uploadQuotaError(testDb, u.andi, 1000, new Date(now.getTime() + 61 * 60_000))).toBeNull();

    await testDb.uploadedFile.create({ data: { key: newKey(), uploaderId: u.sinta, sizeBytes: UPLOAD_QUOTA.bytesPerDay - 1000, createdAt: new Date(now.getTime() - 2 * 60 * 60_000) } });
    expect(await uploadQuotaError(testDb, u.sinta, 1000, now)).toBeNull();
    expect(await uploadQuotaError(testDb, u.sinta, 1001, now)).toContain("MB per hari");
  });
});

describe("job file yatim (hardening Tahap 7)", () => {
  it("hapus file ≥ 24 jam yang tidak dipakai data apa pun; file data yang di-soft-delete & file baru tetap ada; tercatat di audit", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 25 * 60 * 60_000);
    const used = newKey();
    const softDeleted = newKey();
    const orphan = newKey();
    const fresh = newKey();
    for (const key of [used, softDeleted]) await registerUpload(testDb, u.andi, key, 10);
    await addDocument(testDb, actors.andi, ktp(actors.andi, used));
    const gone = await addDocument(testDb, actors.andi, { ...ktp(actors.andi, softDeleted), docType: "NPWP" });
    await deleteDocument(testDb, actors.andi, gone.id);

    const files = new Map([
      [used, old],
      [softDeleted, old],
      [orphan, old],
      [fresh, now],
    ]);
    const storage = {
      list: async () => [...files].map(([key, modifiedAt]) => ({ key, modifiedAt })),
      delete: async (key: string) => void files.delete(key),
    };

    expect(await purgeOrphanFiles(testDb, storage, { now, dryRun: true })).toEqual({ scanned: 4, orphans: [orphan] });
    expect(files.has(orphan)).toBe(true);

    expect(await purgeOrphanFiles(testDb, storage, { now })).toEqual({ scanned: 4, orphans: [orphan] });
    expect([...files.keys()].sort()).toEqual([used, softDeleted, fresh].sort());
    expect(await testDb.auditLog.findFirst({ where: { action: "DELETE", entity: "File", entityId: orphan } })).toMatchObject({ userId: null });
  });
});

describe("PDF berisi JavaScript / aksi berbahaya ditolak (hardening Tahap 7)", () => {
  const pdf = (...objects: string[]) => Buffer.from(`%PDF-1.7\n${objects.join("\n")}\ntrailer << /Root 1 0 R >>\n%%EOF\n`, "latin1");
  const withStream = (content: string) => {
    const head = Buffer.from("%PDF-1.7\n5 0 obj << /Type /ObjStm /Filter /FlateDecode >> stream\n", "latin1");
    const tail = Buffer.from("\nendstream endobj\n%%EOF\n", "latin1");
    return Buffer.concat([head, deflateSync(Buffer.from(content, "latin1")), tail]);
  };

  it("PDF biasa (link, OpenAction zoom halaman awal) diterima", () => {
    const ok = pdf("1 0 obj << /Type /Catalog /OpenAction [3 0 R /Fit] >> endobj", "4 0 obj << /A << /S /URI /URI (https://example.com) >> >> endobj");
    expect(pdfActiveContent(ok)).toBeNull();
    expect(validateUpload(ok)).toMatchObject({ ok: true, ext: "pdf" });
  });

  it("JavaScript, Launch, file tersemat, XFA, nama ber-escape heksadesimal, dan aksi di stream terkompresi ditolak", () => {
    expect(pdfActiveContent(pdf("1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj"))).toBe("JavaScript");
    expect(pdfActiveContent(pdf("1 0 obj << /AA << /O << /S /Launch /F (cmd.exe) >> >> >> endobj"))).toBe("Launch");
    expect(pdfActiveContent(pdf("1 0 obj << /Names << /EmbeddedFiles 2 0 R >> >> endobj"))).toBe("EmbeddedFiles");
    expect(pdfActiveContent(pdf("1 0 obj << /AcroForm << /XFA 9 0 R >> >> endobj"))).toBe("XFA");
    expect(pdfActiveContent(pdf("1 0 obj << /OpenAction << /S /J#61vaScript /J#53 (x) >> >> endobj"))).toBe("JavaScript");
    expect(pdfActiveContent(withStream("<< /S /JavaScript /JS (this.print()) >>"))).toBe("JavaScript");
    expect(validateUpload(pdf("1 0 obj << /JS (x) >> endobj"))).toMatchObject({ ok: false, error: expect.stringContaining("JavaScript") });
  });

  it("kata yang hanya mirip (mis. /JSX, /Launcher) tidak dianggap aksi", () => {
    expect(pdfActiveContent(pdf("1 0 obj << /JSX 1 /Launcher 2 >> endobj"))).toBeNull();
  });
});
