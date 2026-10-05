import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { purgeCutoff, purgeOldInvoices } from "@/lib/services/invoice-purge";
import { testDb } from "@/test/db";
import { createApprovalEntity } from "@/test/entities";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;

beforeEach(async () => {
  u = await resetAndSeed();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("purge invoice > 2 tahun (Fase 14)", () => {
  it("batas = 2 tahun ke belakang, 00:00 WIB", () => {
    expect(purgeCutoff("2026-10-02").toISOString()).toBe("2024-10-01T17:00:00.000Z");
  });

  it("file invoice klaim lama dihapus dari storage & referensinya dikosongkan; yang baru tetap; nominal utuh", async () => {
    const oldId = await createApprovalEntity("HEALTH", u.andi);
    const newId = await createApprovalEntity("HEALTH", u.andi);
    const oldKey = `${randomUUID()}.pdf`;
    const newKey = `${randomUUID()}.pdf`;
    await testDb.healthClaim.update({ where: { id: oldId }, data: { invoiceFileKey: oldKey, invoiceFileName: "lama.pdf", createdAt: new Date("2024-05-01T00:00:00Z") } });
    await testDb.healthClaim.update({ where: { id: newId }, data: { invoiceFileKey: newKey, invoiceFileName: "baru.pdf" } });

    const removed: string[] = [];
    const result = await purgeOldInvoices(testDb, async (key) => void removed.push(key), "2026-10-02");
    expect(result).toEqual({ receipts: 0, invoices: 1 });
    expect(removed).toEqual([oldKey]);
    const old = await testDb.healthClaim.findUniqueOrThrow({ where: { id: oldId } });
    expect([old.invoiceFileKey, Number(old.amount) > 0]).toEqual([null, true]);
    expect((await testDb.healthClaim.findUniqueOrThrow({ where: { id: newId } })).invoiceFileKey).toBe(newKey);
    expect(await testDb.auditLog.count({ where: { entity: "InvoiceFile" } })).toBe(1);

    // Dijalankan lagi: tidak ada yang tersisa.
    expect(await purgeOldInvoices(testDb, async () => undefined, "2026-10-02")).toEqual({ receipts: 0, invoices: 0 });
  });
});
