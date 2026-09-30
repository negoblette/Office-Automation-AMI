import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { approveRequest } from "@/lib/services/approval";
import {
  deleteReimbursementDraft,
  saveReimbursementDraft,
  submitReimbursement,
} from "@/lib/services/reimbursement";
import { reimbursementSchema } from "@/lib/validators/reimbursement";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const actors: Record<string, Actor> = {};
let typeId: Record<string, string>;

beforeEach(async () => {
  u = await resetAndSeed();
  for (const [key, id] of Object.entries(u)) {
    const user = await testDb.user.findUniqueOrThrow({ where: { id } });
    actors[key] = { id: user.id, role: user.role, employeeId: user.employeeId };
  }
  typeId = Object.fromEntries((await testDb.reimburseType.findMany()).map((t) => [t.code, t.id]));
});

afterAll(async () => {
  await testDb.$disconnect();
});

const item = (overrides: Record<string, unknown> = {}) => ({
  date: "2026-09-20",
  customerName: "PT Maju Selaras",
  projectId: "",
  activity: "Kunjungan klien",
  participants: "Budi – Manager IT",
  location: "Jakarta",
  typeId: typeId.TRANSPORT,
  hasReceipt: false,
  paymentMethod: "CASH",
  amount: "450.000",
  receiptFileKey: "",
  receiptFileName: "",
  ...overrides,
});
const input = (items: Record<string, unknown>[], note = "") => reimbursementSchema.parse({ note, items });

async function approvalOf(entityId: string) {
  return testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "REIMBURSE", entityId } } });
}

describe("draft", () => {
  it("draft: nomor sementara, total dihitung server (Cash/CC/Total), customer baru otomatis masuk master", async () => {
    const { reimbursementId } = await saveReimbursementDraft(
      testDb,
      actors.andi,
      null,
      input([item(), item({ paymentMethod: "CC", amount: 1_280_000, customerName: "pt maju selaras" })]),
    );
    const r = await testDb.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId }, include: { items: true } });
    expect(r.number.startsWith("DRAFT-")).toBe(true);
    expect(r).toMatchObject({ status: "DRAFT", totalCash: 450_000n, totalCc: 1_280_000n, total: 1_730_000n, division: "ENGINEER" });
    // Nama sama beda huruf besar/kecil → satu customer.
    expect(await testDb.customer.count()).toBe(1);
    expect(new Set(r.items.map((i) => i.customerId)).size).toBe(1);
  });

  it("v1.14: 6 tipe bebas dipilih semua divisi; divisi yang dibatasi Admin di Master tetap dicek", async () => {
    await expect(saveReimbursementDraft(testDb, actors.andi, null, input([item({ typeId: typeId.MEALS })]))).resolves.toBeTruthy();
    await expect(saveReimbursementDraft(testDb, actors.sinta, null, input([item()]))).resolves.toBeTruthy();
    await testDb.reimburseType.update({ where: { id: typeId.MEALS }, data: { divisions: ["SALES"] } });
    await expect(saveReimbursementDraft(testDb, actors.andi, null, input([item({ typeId: typeId.MEALS })]))).rejects.toThrow(
      "Baris 1: tipe reimburse tidak tersedia untuk divisi Anda",
    );
  });

  it("hanya pemohon yang bisa mengubah/menghapus draft", async () => {
    const { reimbursementId } = await saveReimbursementDraft(testDb, actors.andi, null, input([item()]));
    await expect(saveReimbursementDraft(testDb, actors.yosep, reimbursementId, input([item()]))).rejects.toThrow(
      "Hanya pemohon yang bisa mengubah reimburse ini",
    );
    await expect(deleteReimbursementDraft(testDb, actors.sinta, reimbursementId)).rejects.toThrow("Hanya pemohon");
    await deleteReimbursementDraft(testDb, actors.andi, reimbursementId);
    // Soft delete: data tetap ada tapi tidak bisa diakses/diubah lagi.
    expect((await testDb.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId } })).deletedAt).not.toBeNull();
    await expect(deleteReimbursementDraft(testDb, actors.andi, reimbursementId)).rejects.toThrow("tidak ditemukan");
  });

  it("ganti kwitansi di draft mengembalikan key lama untuk dihapus", async () => {
    const oldKey = `${randomUUID()}.pdf`;
    const { reimbursementId } = await saveReimbursementDraft(testDb, actors.andi, null, input([item({ hasReceipt: true, receiptFileKey: oldKey, receiptFileName: "a.pdf" })]));
    const result = await saveReimbursementDraft(testDb, actors.andi, reimbursementId, input([item({ hasReceipt: true, receiptFileKey: `${randomUUID()}.pdf` })]));
    expect(result.removedFileKeys).toEqual([oldKey]);
  });
});

describe("submit & approval (RMB-01, RMB-07)", () => {
  it("ditolak jika kosong atau kwitansi Ya tanpa file", async () => {
    const empty = await saveReimbursementDraft(testDb, actors.andi, null, input([]));
    await expect(submitReimbursement(testDb, actors.andi, empty.reimbursementId)).rejects.toThrow("minimal 1 baris");
    const noFile = await saveReimbursementDraft(testDb, actors.andi, null, input([item(), item({ hasReceipt: true })]));
    await expect(submitReimbursement(testDb, actors.andi, noFile.reimbursementId)).rejects.toThrow("Baris 2: upload file kwitansi");
  });

  it("Engineer: nomor RMB → Yosep → Rudy → APPROVED + approvedAt", async () => {
    const { reimbursementId } = await saveReimbursementDraft(testDb, actors.andi, null, input([item()]));
    const submitted = await submitReimbursement(testDb, actors.andi, reimbursementId);
    expect(submitted.number).toMatch(/^RMB\/\d{4}\/\d{2}\/0001$/);
    expect(submitted.status).toBe("PENDING");

    // Setelah diajukan tidak bisa diubah lagi.
    await expect(saveReimbursementDraft(testDb, actors.andi, reimbursementId, input([item()]))).rejects.toThrow("sudah diajukan");

    const request = await approvalOf(reimbursementId);
    await approveRequest(testDb, { requestId: request.id, actorId: u.yosep });
    expect((await testDb.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId } })).status).toBe("PENDING");
    await approveRequest(testDb, { requestId: request.id, actorId: u.rudy });

    const approved = await testDb.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId } });
    expect(approved).toMatchObject({ status: "APPROVED", number: submitted.number });
    expect(approved.approvedAt).not.toBeNull();
  });

  it("Sales: Darwin → Leonard", async () => {
    const { reimbursementId } = await saveReimbursementDraft(testDb, actors.sinta, null, input([item({ typeId: typeId.MEALS })]));
    await submitReimbursement(testDb, actors.sinta, reimbursementId);
    const request = await approvalOf(reimbursementId);
    await expect(approveRequest(testDb, { requestId: request.id, actorId: u.yosep })).rejects.toThrow("tidak berhak");
    await approveRequest(testDb, { requestId: request.id, actorId: u.darwin });
    await approveRequest(testDb, { requestId: request.id, actorId: u.leonard });
    expect((await testDb.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId } })).status).toBe("APPROVED");
  });

  it("v1.14: reimburse Direktur → Bu Ika; reimburse Bu Ika sendiri langsung APPROVED", async () => {
    const rudy = await saveReimbursementDraft(testDb, actors.rudy, null, input([item({ typeId: typeId.ENTERTAINMENT })]));
    expect((await submitReimbursement(testDb, actors.rudy, rudy.reimbursementId)).status).toBe("PENDING");

    const ika = await saveReimbursementDraft(testDb, actors.ika, null, input([item()]));
    expect((await submitReimbursement(testDb, actors.ika, ika.reimbursementId)).status).toBe("APPROVED");
    const r = await testDb.reimbursement.findUniqueOrThrow({ where: { id: ika.reimbursementId } });
    expect(r.status).toBe("APPROVED");
    expect(r.approvedAt).not.toBeNull();
  });

  it("nomor berurutan antar pemohon", async () => {
    const a = await saveReimbursementDraft(testDb, actors.andi, null, input([item()]));
    const b = await saveReimbursementDraft(testDb, actors.devi, null, input([item()]));
    const n1 = (await submitReimbursement(testDb, actors.andi, a.reimbursementId)).number;
    const n2 = (await submitReimbursement(testDb, actors.devi, b.reimbursementId)).number;
    expect([n1.slice(-4), n2.slice(-4)]).toEqual(["0001", "0002"]);
  });
});
