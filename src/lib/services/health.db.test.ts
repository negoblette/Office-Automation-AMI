import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { toJakartaIsoDate } from "@/lib/format";
import type { Actor } from "@/lib/services/access";
import { approveRequest } from "@/lib/services/approval";
import { setHealthPlafond, setPayoutPaid, submitHealthClaim } from "@/lib/services/health";
import { applyApprovedHealthClaim } from "@/lib/services/health-payout";
import { healthClaimSchema, healthPlafondSchema } from "@/lib/validators/health";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const actors: Record<string, Actor> = {};
let categoryId: string;
const YEAR = 2026;

beforeEach(async () => {
  u = await resetAndSeed();
  for (const [key, id] of Object.entries(u)) {
    const user = await testDb.user.findUniqueOrThrow({ where: { id } });
    actors[key] = { id: user.id, role: user.role, employeeId: user.employeeId };
  }
  categoryId = (await testDb.healthCategory.findFirstOrThrow({ where: { name: "Rawat Jalan Dokter" } })).id;
});

afterAll(async () => {
  await testDb.$disconnect();
});

const plafond = (key: string, annualAmount: number, year = YEAR) =>
  setHealthPlafond(testDb, u.ika, healthPlafondSchema.parse({ employeeId: actors[key].employeeId, year, annualAmount }));
const claim = (key: string, amount: number, claimDate = `${YEAR}-09-10`) =>
  submitHealthClaim(
    testDb,
    actors[key],
    healthClaimSchema.parse({ categoryId, claimDate, amount, invoiceFileKey: `${randomUUID()}.pdf`, invoiceFileName: "invoice.pdf", note: "" }),
  );
const requestOf = (claimId: string) =>
  testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "HEALTH", entityId: claimId } } });
const payoutsOf = async (claimId: string) =>
  (await testDb.healthPayout.findMany({ where: { claimId }, orderBy: { periodMonth: "asc" } })).map((p) => [
    toJakartaIsoDate(p.periodMonth).slice(0, 7),
    Number(p.amount),
  ]);

describe("plafon tahunan (HC-01)", () => {
  it("hanya plafon tahunan yang disimpan", async () => {
    const saved = await plafond("devi", 10_000_000);
    expect(Number(saved.annualAmount)).toBe(10_000_000);
  });

  it("klaim tanpa plafon tahun itu ditolak", async () => {
    await expect(claim("devi", 100_000)).rejects.toThrow("Plafon kesehatan tahun 2026 belum diatur");
  });

  it("plafon tidak bisa diturunkan di bawah klaim yang sudah diajukan", async () => {
    await plafond("devi", 5_000_000);
    await claim("devi", 3_000_000);
    await expect(plafond("devi", 2_000_000)).rejects.toThrow("Plafon tidak boleh di bawah klaim");
  });
});

describe("klaim (HC-03, HC-07)", () => {
  it("klaim > sisa plafon tahunan ditolak; PENDING ikut dihitung", async () => {
    await plafond("devi", 5_000_000);
    await claim("devi", 4_000_000);
    await expect(claim("devi", 1_500_000)).rejects.toThrow("Sisa plafon 2026 Rp 1.000.000, klaim Rp 1.500.000");
    await expect(claim("devi", 1_000_000)).resolves.toMatchObject({ status: "PENDING" });
  });

  it("nomor HC, approval Ika; setelah approve → APPROVED + jadwal payout", async () => {
    await plafond("devi", 12_000_000);
    const result = await claim("devi", 2_500_000);
    expect(result.number).toMatch(/^HC\/\d{4}\/\d{2}\/0001$/);

    const request = await requestOf(result.claimId);
    await expect(approveRequest(testDb, { requestId: request.id, actorId: u.rudy })).rejects.toThrow("tidak berhak");
    await approveRequest(testDb, { requestId: request.id, actorId: u.ika });

    const saved = await testDb.healthClaim.findUniqueOrThrow({ where: { id: result.claimId } });
    expect(saved.status).toBe("APPROVED");
    // Plafon hanya tahunan → dibayar penuh sekaligus di bulan approval.
    expect(await payoutsOf(result.claimId)).toEqual([[toJakartaIsoDate(saved.approvedAt!).slice(0, 7), 2_500_000]]);
  });

  it("klaim Ika sendiri → FALLBACK Rudy/Leonard", async () => {
    await plafond("ika", 6_000_000);
    const result = await claim("ika", 300_000);
    const request = await requestOf(result.claimId);
    await expect(approveRequest(testDb, { requestId: request.id, actorId: u.ika })).rejects.toThrow("tidak berhak");
    await approveRequest(testDb, { requestId: request.id, actorId: u.leonard });
    expect((await testDb.healthClaim.findUniqueOrThrow({ where: { id: result.claimId } })).status).toBe("APPROVED");
  });
});

describe("jadwal pembayaran (HC-05/06 — plafon tahunan, keputusan user 2026-09-29)", () => {
  async function approveAt(claimId: string, isoDateTime: string) {
    await testDb.$transaction((tx) => applyApprovedHealthClaim(tx, claimId, new Date(isoDateTime)));
  }

  it("setiap klaim dibayar penuh di bulan approval, tanpa batas bulanan", async () => {
    await plafond("andi", 12_000_000);
    const a = await claim("andi", 800_000);
    const b = await claim("andi", 5_000_000);
    await approveAt(a.claimId, "2026-09-15T03:00:00Z");
    await approveAt(b.claimId, "2026-09-20T03:00:00Z");
    expect(await payoutsOf(a.claimId)).toEqual([["2026-09", 800_000]]);
    expect(await payoutsOf(b.claimId)).toEqual([["2026-09", 5_000_000]]);
  });

  it("approve akhir bulan (WIB) masuk bulan approval menurut Jakarta", async () => {
    await plafond("andi", 10_000_000, 2026);
    const c = await claim("andi", 2_000_000, "2026-11-02");
    await approveAt(c.claimId, "2026-11-30T18:00:00Z"); // 1 Des 01:00 WIB
    expect(await payoutsOf(c.claimId)).toEqual([["2026-12", 2_000_000]]);
  });

  it("tandai dibayar / batal", async () => {
    await plafond("andi", 12_000_000);
    const c = await claim("andi", 100_000);
    await approveAt(c.claimId, "2026-09-15T03:00:00Z");
    const payout = await testDb.healthPayout.findFirstOrThrow({ where: { claimId: c.claimId } });
    await setPayoutPaid(testDb, u.ika, payout.id, true);
    expect((await testDb.healthPayout.findUniqueOrThrow({ where: { id: payout.id } })).paidAt).not.toBeNull();
    await setPayoutPaid(testDb, u.ika, payout.id, false);
    expect((await testDb.healthPayout.findUniqueOrThrow({ where: { id: payout.id } })).paidAt).toBeNull();
  });
});
