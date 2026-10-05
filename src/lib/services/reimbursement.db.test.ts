import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { approveRequest } from "@/lib/services/approval";
import {
  deleteReimbursementDraft,
  saveReimbursementDraft,
  submitReimbursement,
} from "@/lib/services/reimbursement";
import { saveCustomer } from "@/lib/services/project";
import { itemsToVisits, NEW_ACQUISITION, reimbursementFormSchema, reimbursementSchema } from "@/lib/validators/reimbursement";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const actors: Record<string, Actor> = {};
let typeId: Record<string, string>;
let customerId: string;

beforeEach(async () => {
  u = await resetAndSeed();
  for (const [key, id] of Object.entries(u)) {
    const user = await testDb.user.findUniqueOrThrow({ where: { id } });
    actors[key] = { id: user.id, role: user.role, employeeId: user.employeeId };
  }
  typeId = Object.fromEntries((await testDb.reimburseType.findMany()).map((t) => [t.code, t.id]));
  customerId = (await saveCustomer(testDb, u.ika, null, "PT Maju Selaras")).id;
});

afterAll(async () => {
  await testDb.$disconnect();
});

const item = (overrides: Record<string, unknown> = {}) => ({
  date: "2026-09-20",
  customerId,
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
  it("draft: nomor sementara, total dihitung server (Cash/CC/Total), company dari master", async () => {
    const { reimbursementId } = await saveReimbursementDraft(
      testDb,
      actors.andi,
      null,
      input([item(), item({ paymentMethod: "CC", amount: 1_280_000 })]),
    );
    const r = await testDb.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId }, include: { items: true } });
    expect(r.number.startsWith("DRAFT-")).toBe(true);
    expect(r).toMatchObject({ status: "DRAFT", totalCash: 450_000n, totalCc: 1_280_000n, total: 1_730_000n, division: "ENGINEER" });
    expect(new Set(r.items.map((i) => i.customerId))).toEqual(new Set([customerId]));
  });

  it("Fase 14: company wajib dari master (tidak dibuat otomatis); New Acquisition = flag tanpa project", async () => {
    expect(() => input([item({ customerId: "" })])).toThrow("Company wajib dipilih");
    await expect(saveReimbursementDraft(testDb, actors.andi, null, input([item({ customerId: "tidak-ada" })]))).rejects.toThrow(
      "Baris 1: company tidak ditemukan di master",
    );
    expect(await testDb.customer.count()).toBe(1);

    const { reimbursementId } = await saveReimbursementDraft(testDb, actors.andi, null, input([item({ newAcquisition: true })]));
    const [row] = await testDb.reimbursementItem.findMany({ where: { reimbursementId } });
    expect(row).toMatchObject({ customerId, projectId: null, newAcquisition: true });
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

  it("upload kwitansi dihapus (Fase 14): baris 'ada kwitansi' bisa diajukan tanpa file", async () => {
    const { reimbursementId } = await saveReimbursementDraft(testDb, actors.andi, null, input([item({ hasReceipt: true })]));
    await expect(submitReimbursement(testDb, actors.andi, reimbursementId)).resolves.toMatchObject({ status: "PENDING" });
  });
});

describe("submit & approval (RMB-01, RMB-07)", () => {
  it("ditolak jika kosong", async () => {
    const empty = await saveReimbursementDraft(testDb, actors.andi, null, input([]));
    await expect(submitReimbursement(testDb, actors.andi, empty.reimbursementId)).rejects.toThrow("minimal 1 baris");
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

  it("Sales: Darwin / Leonard — salah satu cukup (adu cepat)", async () => {
    const { reimbursementId } = await saveReimbursementDraft(testDb, actors.sinta, null, input([item({ typeId: typeId.MEALS })]));
    await submitReimbursement(testDb, actors.sinta, reimbursementId);
    const request = await approvalOf(reimbursementId);
    await expect(approveRequest(testDb, { requestId: request.id, actorId: u.yosep })).rejects.toThrow("tidak berhak");
    expect((await approveRequest(testDb, { requestId: request.id, actorId: u.darwin })).status).toBe("APPROVED");
    await expect(approveRequest(testDb, { requestId: request.id, actorId: u.leonard })).rejects.toThrow("sudah diproses");
    expect((await testDb.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId } })).status).toBe("APPROVED");
  });

  it("reimburse Direktur → Bu Ika; reimburse Bu Ika sendiri → Ko Leonard", async () => {
    const rudy = await saveReimbursementDraft(testDb, actors.rudy, null, input([item({ typeId: typeId.ENTERTAINMENT })]));
    expect((await submitReimbursement(testDb, actors.rudy, rudy.reimbursementId)).status).toBe("PENDING");

    const ika = await saveReimbursementDraft(testDb, actors.ika, null, input([item()]));
    expect((await submitReimbursement(testDb, actors.ika, ika.reimbursementId)).status).toBe("PENDING");
    const request = await approvalOf(ika.reimbursementId);
    await expect(approveRequest(testDb, { requestId: request.id, actorId: u.ika })).rejects.toThrow("tidak berhak");
    await approveRequest(testDb, { requestId: request.id, actorId: u.leonard });
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

describe("form kunjungan → baris (Fase 14)", () => {
  const line = (amount: number) => ({
    activity: "Meeting",
    participants: "Budi – Manager IT",
    location: "Jakarta",
    typeId: "t1",
    hasReceipt: false,
    paymentMethod: "CASH",
    amount,
  });

  it("kunjungan diratakan jadi baris; tanggal/company/project ikut tiap baris; New Acquisition jadi flag", () => {
    const out = reimbursementFormSchema.parse({
      note: "",
      visits: [
        { date: "2026-09-20", customerId: "c1", project: "p1", lines: [line(100), line(200)] },
        { date: "2026-09-20", customerId: "c2", project: NEW_ACQUISITION, lines: [line(300)] },
        { date: "2026-09-21", customerId: "c1", project: "", lines: [line(400)] },
      ],
    });
    expect(out.items.map((i) => [i.date, i.customerId, i.projectId, i.newAcquisition, i.amount])).toEqual([
      ["2026-09-20", "c1", "p1", false, 100],
      ["2026-09-20", "c1", "p1", false, 200],
      ["2026-09-20", "c2", null, true, 300],
      ["2026-09-21", "c1", null, false, 400],
    ]);
    expect(() => reimbursementFormSchema.parse({ note: "", visits: [{ date: "2026-09-20", customerId: "", project: "", lines: [line(1)] }] })).toThrow(
      "Company wajib dipilih",
    );
    expect(() => reimbursementFormSchema.parse({ note: "", visits: [{ date: "2026-09-20", customerId: "c1", project: "", lines: [] }] })).toThrow("Minimal 1 baris");
  });

  it("itemsToVisits: baris berurutan dengan tanggal/company/project sama digabung lagi (form edit)", () => {
    const visits = itemsToVisits([
      { date: "2026-09-20", customerId: "c1", projectId: "p1", newAcquisition: false, n: 1 },
      { date: "2026-09-20", customerId: "c1", projectId: "p1", newAcquisition: false, n: 2 },
      { date: "2026-09-20", customerId: "c2", projectId: null, newAcquisition: true, n: 3 },
      { date: "2026-09-21", customerId: null, projectId: null, newAcquisition: false, n: 4 },
    ]);
    expect(visits.map((v) => [v.date, v.customerId, v.project, v.lines.map((l) => l.n)])).toEqual([
      ["2026-09-20", "c1", "p1", [1, 2]],
      ["2026-09-20", "c2", NEW_ACQUISITION, [3]],
      ["2026-09-21", "", "", [4]],
    ]);
  });
});
