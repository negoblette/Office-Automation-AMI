// Skenario uji wajib Tech Spec §4.5 + perilaku approve (§4.2), dengan approval flow hasil seed.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ApprovalModule } from "@/generated/prisma/client";
import { approveRequest, buildApproval, ForbiddenError } from "@/lib/services/approval";
import { resetAndSeed } from "@/test/seed";
import { testDb } from "@/test/db";
import { createApprovalEntity } from "@/test/entities";

let u: Record<string, string>;

beforeEach(async () => {
  u = await resetAndSeed();
});

afterAll(async () => {
  await testDb.$disconnect();
});

async function submit(requesterKey: string, module: ApprovalModule) {
  const entityId = await createApprovalEntity(module, u[requesterKey]);
  return testDb.$transaction((tx) =>
    buildApproval(tx, { module, entityId, entityNumber: "UJI/2026/09/0001", requesterId: u[requesterKey] }),
  );
}

/** Ringkasan step: [level, nama approver (urut), status]. */
async function stepsOf(requestId: string) {
  const request = await testDb.approvalRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { steps: { orderBy: { level: "asc" } } },
  });
  const nameOf = Object.fromEntries(Object.entries(u).map(([key, id]) => [id, key]));
  return {
    status: request.status,
    currentLevel: request.currentLevel,
    steps: request.steps.map((s) => [s.level, s.approverIds.map((id) => nameOf[id]).sort().join("/"), s.status]),
  };
}

const approve = (requestId: string, actorKey: string) => approveRequest(testDb, { requestId, actorId: u[actorKey] });

describe("Tech Spec §4.5 — pembentukan approval", () => {
  it("Staf Engineer REIMBURSE → L1 Yosep → L2 Rudy", async () => {
    const { requestId, notifications } = await submit("andi", "REIMBURSE");
    expect(await stepsOf(requestId)).toEqual({
      status: "PENDING",
      currentLevel: 1,
      steps: [
        [1, "yosep", "PENDING"],
        [2, "rudy", "WAITING"],
      ],
    });
    expect(notifications).toEqual([{ template: "approval-requested", recipientIds: [u.yosep], requestId }]);
  });

  it("LEAVE semua divisi → hanya Rudy (keputusan user 2026-09-29)", async () => {
    for (const key of ["yosep", "andi", "sinta"]) {
      const { requestId } = await submit(key, "LEAVE");
      expect(await stepsOf(requestId)).toEqual({ status: "PENDING", currentLevel: 1, steps: [[1, "rudy", "PENDING"]] });
    }
  });

  // Fase 14 (2026-10-02): Sales satu level Darwin / Leonard; pemohon dikeluarkan dari levelnya.
  it("Staf Sales REIMBURSE → Darwin / Leonard (salah satu)", async () => {
    const { requestId } = await submit("sinta", "REIMBURSE");
    expect((await stepsOf(requestId)).steps).toEqual([[1, "darwin/leonard", "PENDING"]]);
  });

  it("Darwin REIMBURSE → Leonard", async () => {
    const { requestId } = await submit("darwin", "REIMBURSE");
    expect((await stepsOf(requestId)).steps).toEqual([[1, "leonard", "PENDING"]]);
  });

  // Matriks persetujuan v1.14.
  it("cuti divisi Direktur → tanpa approval, email final ke pemohon + semua Admin", async () => {
    for (const key of ["rudy", "leonard"]) {
      const { requestId, status, notifications } = await submit(key, "LEAVE");
      expect(status).toBe("APPROVED");
      expect(await stepsOf(requestId)).toEqual({ status: "APPROVED", currentLevel: null, steps: [] });
      expect(notifications[0].template).toBe("approval-final");
      // Admin = Ika, Rudy, Leonard (Darwin & Yosep kini Approver).
      expect([...notifications[0].recipientIds].sort()).toEqual([u.rudy, u.leonard, u.ika].sort());
    }
  });

  it.each(["REIMBURSE", "EXPENSE", "REVENUE", "HEALTH"] as const)("Direktur %s → Bu Ika (tidak lagi otomatis)", async (module) => {
    const { requestId } = await submit("rudy", module);
    expect(await stepsOf(requestId)).toEqual({ status: "PENDING", currentLevel: 1, steps: [[1, "ika", "PENDING"]] });
  });

  it("Bu Devi (Umum) REIMBURSE → Bu Ika / Ko Leonard", async () => {
    const { requestId, notifications } = await submit("devi", "REIMBURSE");
    expect((await stepsOf(requestId)).steps).toEqual([[1, "ika/leonard", "PENDING"]]);
    expect([...notifications[0].recipientIds].sort()).toEqual([u.ika, u.leonard].sort());
  });

  it.each(["REIMBURSE", "EXPENSE", "REVENUE"] as const)("Bu Ika %s sendiri → Ko Leonard", async (module) => {
    const { requestId, status } = await submit("ika", module);
    expect(status).toBe("PENDING");
    expect((await stepsOf(requestId)).steps).toEqual([[1, "leonard", "PENDING"]]);
  });

  it("Approver (role APPROVER) bisa menyetujui; Staf tidak", async () => {
    const { requestId } = await submit("andi", "REIMBURSE");
    expect((await testDb.user.findUniqueOrThrow({ where: { id: u.yosep } })).role).toBe("APPROVER");
    expect((await approve(requestId, "yosep")).status).toBe("PENDING");
  });

  it("Bu Devi HEALTH → Ika", async () => {
    const { requestId } = await submit("devi", "HEALTH");
    expect((await stepsOf(requestId)).steps).toEqual([[1, "ika", "PENDING"]]);
  });

  it("Ika HEALTH → step Ika dilewati → FALLBACK Rudy/Leonard", async () => {
    const { requestId } = await submit("ika", "HEALTH");
    expect(await stepsOf(requestId)).toEqual({
      status: "PENDING",
      currentLevel: 2,
      steps: [
        [1, "ika", "SKIPPED"],
        [2, "leonard/rudy", "PENDING"],
      ],
    });
  });

  it("Ika LEAVE → Rudy", async () => {
    const { requestId } = await submit("ika", "LEAVE");
    expect((await stepsOf(requestId)).steps).toEqual([[1, "rudy", "PENDING"]]);
  });


  it("Darwin coba approve reimburse Engineer → ditolak 403", async () => {
    const { requestId } = await submit("andi", "REIMBURSE");
    await expect(approve(requestId, "darwin")).rejects.toBeInstanceOf(ForbiddenError);
    expect((await stepsOf(requestId)).steps[0]).toEqual([1, "yosep", "PENDING"]);
  });
});

describe("Tech Spec §4.2 — approve", () => {
  it("Engineer end-to-end: Yosep (L1) → Rudy (L2, final) + email yang tepat + audit", async () => {
    const { requestId } = await submit("andi", "REIMBURSE");

    // Rudy (approver L2) belum boleh approve selagi L1 PENDING.
    await expect(approve(requestId, "rudy")).rejects.toBeInstanceOf(ForbiddenError);

    const first = await approve(requestId, "yosep");
    expect(first).toEqual({
      status: "PENDING",
      notifications: [
        { template: "approval-requested", recipientIds: [u.rudy], requestId },
        { template: "approval-progress", recipientIds: [u.andi], requestId },
      ],
    });
    expect(await stepsOf(requestId)).toMatchObject({ status: "PENDING", currentLevel: 2 });

    const final = await approve(requestId, "rudy");
    expect(final.status).toBe("APPROVED");
    expect(final.notifications[0].template).toBe("approval-final");
    expect([...final.notifications[0].recipientIds].sort()).toEqual(
      [u.andi, u.rudy, u.leonard, u.ika].sort(),
    );

    const request = await testDb.approvalRequest.findUniqueOrThrow({ where: { id: requestId }, include: { steps: true } });
    expect(request).toMatchObject({ status: "APPROVED", currentLevel: null });
    expect(request.completedAt).not.toBeNull();
    expect(request.steps.find((s) => s.level === 2)).toMatchObject({ status: "APPROVED", actedById: u.rudy });
    expect(await testDb.auditLog.count({ where: { entityId: requestId, action: "APPROVE" } })).toBe(2);
  });

  it("step dengan 2 approver: salah satu cukup; approve kedua ditolak", async () => {
    const { requestId } = await submit("ika", "HEALTH"); // Fallback Rudy / Leonard
    expect((await approve(requestId, "leonard")).status).toBe("APPROVED");
    await expect(approve(requestId, "rudy")).rejects.toThrow("Pengajuan ini sudah diproses");
  });

  it("Rudy & Leonard approve bersamaan → hanya satu yang berhasil", async () => {
    const { requestId } = await submit("ika", "HEALTH");
    const results = await Promise.allSettled([approve(requestId, "rudy"), approve(requestId, "leonard")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const approvedSteps = await testDb.approvalRequestStep.count({ where: { requestId, status: "APPROVED" } });
    expect(approvedSteps).toBe(1);
  });

  it("Staf (bukan Admin) tidak bisa approve walau namanya dimasukkan sebagai approver", async () => {
    const { requestId } = await submit("sinta", "REIMBURSE");
    await testDb.approvalRequestStep.updateMany({ where: { requestId, level: 1 }, data: { approverIds: [u.andi] } });
    await expect(approve(requestId, "andi")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("approver yang akunnya nonaktif tidak masuk snapshot", async () => {
    await testDb.user.update({ where: { id: u.leonard }, data: { isActive: false } });
    const { requestId } = await submit("ika", "HEALTH");
    expect((await stepsOf(requestId)).steps).toEqual([
      [1, "ika", "SKIPPED"],
      [2, "rudy", "PENDING"],
    ]);
  });
});
