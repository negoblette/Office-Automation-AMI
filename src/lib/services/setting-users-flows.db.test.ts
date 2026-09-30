import argon2 from "argon2";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApproval } from "@/lib/services/approval";
import { deleteFlow, listFlows, saveFlow, setFlowActive } from "@/lib/services/approval-flow";
import { resignEmployee } from "@/lib/services/employee";
import { resetUserPassword, setUserActive, setUserRole } from "@/lib/services/user-admin";
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

const flowOf = async (module: "REIMBURSE" | "HEALTH", division: "ENGINEER" | null) =>
  testDb.approvalFlow.findFirstOrThrow({ where: { scope: "REGULAR", module, division } });

describe("User & Role", () => {
  it("tidak bisa ubah role / nonaktifkan diri sendiri", async () => {
    await expect(setUserRole(testDb, u.yosep, u.yosep, "STAFF")).rejects.toThrow("role akun Anda sendiri");
    await expect(setUserActive(testDb, u.yosep, u.yosep, false)).rejects.toThrow("akun Anda sendiri");
  });

  it("satu-satunya approver di flow tidak bisa diturunkan / dinonaktifkan / di-resign", async () => {
    await expect(setUserRole(testDb, u.rudy, u.yosep, "STAFF")).rejects.toThrow("Reimburse · Engineer L1");
    await expect(setUserActive(testDb, u.rudy, u.ika, false)).rejects.toThrow("Klaim Kesehatan · Semua divisi L1");
    const yosepEmployee = (await testDb.user.findUniqueOrThrow({ where: { id: u.yosep } })).employeeId!;
    await expect(resignEmployee(testDb, u.rudy, yosepEmployee, "2026-09-30")).rejects.toThrow("satu-satunya approver");
  });

  it("approver yang masih punya pengganti (Rudy/Leonard) boleh dinonaktifkan jika tidak jadi satu-satunya", async () => {
    // Rudy satu-satunya di Engineer L2 → ganti dulu flow Engineer (semua modul) jadi Rudy/Leonard.
    const flows = await testDb.approvalFlow.findMany({ where: { division: "ENGINEER" } });
    for (const flow of flows) {
      await saveFlow(testDb, u.yosep, flow.id, { steps: [{ approverIds: [u.yosep] }, { approverIds: [u.rudy, u.leonard] }] });
    }
    // Rudy juga satu-satunya approver cuti → tetap ditolak sampai flow cuti diubah.
    await expect(setUserActive(testDb, u.yosep, u.rudy, false)).rejects.toThrow("Cuti · Semua divisi L1");
    const leaveFlow = await testDb.approvalFlow.findFirstOrThrow({ where: { module: "LEAVE" } });
    await saveFlow(testDb, u.yosep, leaveFlow.id, { steps: [{ approverIds: [u.rudy, u.leonard] }] });
    await setUserActive(testDb, u.yosep, u.rudy, false);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: u.rudy } })).isActive).toBe(false);
  });

  it("pengajuan berjalan yang hanya bisa disetujui user itu → ditolak", async () => {
    const entityId = await createApprovalEntity("REIMBURSE", u.andi);
    await testDb.$transaction((tx) => buildApproval(tx, { module: "REIMBURSE", entityId, entityNumber: "RMB/1", requesterId: u.andi }));
    // Flow diubah: Yosep tidak lagi di flow, tapi snapshot pengajuan masih menunggu Yosep.
    const flows = await testDb.approvalFlow.findMany({ where: { division: "ENGINEER" } });
    for (const flow of flows) await saveFlow(testDb, u.rudy, flow.id, { steps: [{ approverIds: [u.rudy] }] });
    await expect(setUserRole(testDb, u.rudy, u.yosep, "STAFF")).rejects.toThrow("1 pengajuan");
  });

  it("karyawan resign tidak bisa diaktifkan dari Setting User", async () => {
    const andiEmployee = (await testDb.user.findUniqueOrThrow({ where: { id: u.andi } })).employeeId!;
    await resignEmployee(testDb, u.yosep, andiEmployee, "2026-09-30");
    await expect(setUserActive(testDb, u.yosep, u.andi, true)).rejects.toThrow("Arsip");
  });

  it("reset password: hash baru, audit tanpa password", async () => {
    await resetUserPassword(testDb, u.yosep, u.andi, "PasswordBaru1");
    const andi = await testDb.user.findUniqueOrThrow({ where: { id: u.andi } });
    expect(await argon2.verify(andi.passwordHash, "PasswordBaru1")).toBe(true);
    const audit = await testDb.auditLog.findFirstOrThrow({ where: { entity: "User", entityId: u.andi } });
    expect(JSON.stringify(audit.after)).not.toContain("PasswordBaru1");
  });
});

describe("Approval Flow", () => {
  it("ubah step: berlaku untuk pengajuan baru, pengajuan berjalan tetap snapshot lama", async () => {
    const old = await createApprovalEntity("REIMBURSE", u.andi);
    await testDb.$transaction((tx) => buildApproval(tx, { module: "REIMBURSE", entityId: old, entityNumber: "RMB/1", requesterId: u.andi }));

    const flow = await flowOf("REIMBURSE", "ENGINEER");
    await saveFlow(testDb, u.yosep, flow.id, { steps: [{ approverIds: [u.ika] }] });

    const fresh = await createApprovalEntity("REIMBURSE", u.andi);
    await testDb.$transaction((tx) => buildApproval(tx, { module: "REIMBURSE", entityId: fresh, entityNumber: "RMB/2", requesterId: u.andi }));
    const steps = await testDb.approvalRequestStep.findMany({ include: { request: true }, orderBy: [{ request: { entityNumber: "asc" } }, { level: "asc" }] });
    expect(steps.map((s) => [s.request.entityNumber, s.level, s.approverIds])).toEqual([
      ["RMB/1", 1, [u.yosep]],
      ["RMB/1", 2, [u.rudy]],
      ["RMB/2", 1, [u.ika]],
    ]);
  });

  it("validasi: approver harus Admin aktif, tidak duplikat antar level, flow modul+divisi unik", async () => {
    const flow = await flowOf("REIMBURSE", "ENGINEER");
    await expect(saveFlow(testDb, u.yosep, flow.id, { steps: [{ approverIds: [u.andi] }] })).rejects.toThrow("Admin yang aktif");
    await expect(saveFlow(testDb, u.yosep, flow.id, { steps: [{ approverIds: [u.rudy] }, { approverIds: [u.rudy] }] })).rejects.toThrow("lebih dari satu level");
    await expect(saveFlow(testDb, u.yosep, null, { module: "REIMBURSE", division: "ENGINEER", steps: [{ approverIds: [u.rudy] }] })).rejects.toThrow("Sudah ada flow aktif");

    await setFlowActive(testDb, u.yosep, flow.id, false);
    await saveFlow(testDb, u.yosep, null, { module: "REIMBURSE", division: "ENGINEER", steps: [{ approverIds: [u.rudy] }] });
    await expect(setFlowActive(testDb, u.yosep, flow.id, true)).rejects.toThrow("Sudah ada flow aktif");
    await deleteFlow(testDb, u.yosep, flow.id);
    expect((await testDb.approvalFlow.findUniqueOrThrow({ where: { id: flow.id } })).deletedAt).not.toBeNull(); // soft delete
    expect((await listFlows(testDb)).some((f) => f.id === flow.id)).toBe(false);
  });

  it("Fallback tidak bisa dinonaktifkan / dihapus, tapi step-nya bisa diubah", async () => {
    const fallback = await testDb.approvalFlow.findFirstOrThrow({ where: { scope: "FALLBACK" } });
    await expect(setFlowActive(testDb, u.yosep, fallback.id, false)).rejects.toThrow("Fallback");
    await expect(deleteFlow(testDb, u.yosep, fallback.id)).rejects.toThrow("Fallback");
    await saveFlow(testDb, u.yosep, fallback.id, { module: "LEAVE", division: "SALES", steps: [{ approverIds: [u.leonard] }] });
    const view = (await listFlows(testDb)).find((f) => f.id === fallback.id)!;
    expect(view).toMatchObject({ label: "Fallback", module: null, division: null, steps: [{ level: 1, approvers: [{ name: "Leonard" }] }] });
  });
});
