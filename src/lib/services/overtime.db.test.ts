import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { approveRequest, rejectRequest, revokeApproval } from "@/lib/services/approval";
import { listCorrections } from "@/lib/services/approval-correction";
import { listMyApprovalQueue } from "@/lib/services/approval-queries";
import { cancelOvertime, finishOvertime, overtimeReimburseType, startOvertime } from "@/lib/services/overtime";
import { listOvertimes, listReimbursableOvertimes } from "@/lib/services/overtime-queries";
import { saveCustomer, saveProject } from "@/lib/services/project";
import { deleteReimbursementDraft, saveReimbursementDraft, submitReimbursement } from "@/lib/services/reimbursement";
import { getReimbursementFormOptions } from "@/lib/services/reimbursement-queries";
import { overtimeFinishSchema } from "@/lib/validators/overtime";
import { projectSchema } from "@/lib/validators/project";
import { reimbursementSchema } from "@/lib/validators/reimbursement";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const actors: Record<string, Actor> = {};
let customerId: string;
let projectId: string;

beforeEach(async () => {
  u = await resetAndSeed();
  for (const [key, id] of Object.entries(u)) {
    const user = await testDb.user.findUniqueOrThrow({ where: { id } });
    actors[key] = { id: user.id, role: user.role, employeeId: user.employeeId };
  }
  customerId = (await saveCustomer(testDb, u.ika, null, "PT Maju Selaras")).id;
  projectId = (await saveProject(testDb, u.ika, null, projectSchema.parse({ customerId, code: "PRJ-01", name: "Core Network", type: "RUNNING", isActive: true }))).id;
});

afterAll(async () => {
  await testDb.$disconnect();
});

const at = (iso: string) => new Date(`${iso}+07:00`);
const finish = (activity = "Migrasi router") => overtimeFinishSchema.parse({ customerId, projectId, activity });
const approvalOf = (module: "OVERTIME" | "REIMBURSE", entityId: string) =>
  testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module, entityId } }, include: { steps: { orderBy: { level: "asc" } } } });
const overtime = (id: string) => testDb.overtime.findUniqueOrThrow({ where: { id } });

/** Satu sesi overtime Andi (Engineer) yang sudah di-finalize (menunggu Ko Yosep). */
async function session(start: string, end: string) {
  const record = await startOvertime(testDb, actors.andi, at(start));
  await finishOvertime(testDb, actors.andi, record.id, finish(), at(end));
  return record.id;
}

/** Sesi yang sudah disetujui Ko Yosep. */
async function approvedSession(start: string, end: string) {
  const id = await session(start, end);
  await approveRequest(testDb, { requestId: (await approvalOf("OVERTIME", id)).id, actorId: u.yosep });
  return id;
}

describe("overtime engineer (2026-10-30)", () => {
  it("hanya karyawan divisi Engineer", async () => {
    await expect(startOvertime(testDb, actors.sinta)).rejects.toThrow("Overtime hanya untuk karyawan aktif divisi Engineer");
    await expect(startOvertime(testDb, actors.rudy)).rejects.toThrow("Overtime hanya untuk karyawan aktif divisi Engineer");
  });

  it("beberapa sesi sehari, satu sesi berjalan; clock out wajib customer + project milik customer itu → diajukan ke Ko Yosep", async () => {
    const first = await startOvertime(testDb, actors.andi, at("2026-10-20T18:00"));
    await expect(startOvertime(testDb, actors.andi, at("2026-10-20T18:05"))).rejects.toThrow("Overtime sebelumnya belum di-clock out");

    const other = (await saveCustomer(testDb, u.ika, null, "PT Lain")).id;
    await expect(finishOvertime(testDb, actors.andi, first.id, overtimeFinishSchema.parse({ customerId: other, projectId, activity: "Kerja" }))).rejects.toThrow(
      "Project bukan milik PT Lain",
    );
    expect(() => overtimeFinishSchema.parse({ customerId, projectId: "", activity: "Kerja" })).toThrow("Project wajib dipilih");

    const result = await finishOvertime(testDb, actors.andi, first.id, finish(), at("2026-10-20T20:00"));
    expect(result).toMatchObject({ number: "OVT/2026/10/0001", status: "PENDING" });
    expect(result.notifications).toEqual([expect.objectContaining({ template: "approval-requested", recipientIds: [u.yosep] })]);
    await expect(finishOvertime(testDb, actors.andi, first.id, finish(), at("2026-10-20T21:00"))).rejects.toThrow("Overtime ini sudah selesai");
    await session("2026-10-20T21:00", "2026-10-20T23:30");

    const rows = await listOvertimes(testDb, actors.andi.employeeId, "2026-10");
    expect(rows.map((r) => [r.date, r.clockIn, r.clockOut, r.minutes, r.status, r.projectName])).toEqual([
      ["2026-10-20", "18:00", "20:00", 120, "PENDING", "PRJ-01 - Core Network"],
      ["2026-10-20", "21:00", "23:30", 150, "PENDING", "PRJ-01 - Core Network"],
    ]);
    const [queued] = await listMyApprovalQueue(testDb, u.yosep);
    expect(queued).toMatchObject({ module: "OVERTIME", entityNumber: "OVT/2026/10/0001", canApprove: true });
    expect(queued.summary).toContain("PT Maju Selaras · PRJ-01 - Core Network · Migrasi router");
  });

  it("sesi berjalan bisa dibatalkan pemiliknya; sesi selesai tidak", async () => {
    const open = await startOvertime(testDb, actors.andi);
    await expect(cancelOvertime(testDb, actors.yosep, open.id)).rejects.toThrow("Overtime tidak ditemukan");
    await cancelOvertime(testDb, actors.andi, open.id);
    expect(await testDb.overtime.count()).toBe(0);

    const done = await session("2026-10-20T18:00", "2026-10-20T19:00");
    await expect(cancelOvertime(testDb, actors.andi, done)).rejects.toThrow("Overtime ini sudah selesai");
  });

  it("disetujui → APPROVED; ditolak → revisi isian lalu diajukan ulang dengan nomor sama (jam tetap)", async () => {
    const approved = await approvedSession("2026-10-20T18:00", "2026-10-20T19:00");
    expect(await overtime(approved)).toMatchObject({ status: "APPROVED" });

    const rejected = await session("2026-10-21T18:00", "2026-10-21T19:00");
    await rejectRequest(testDb, { requestId: (await approvalOf("OVERTIME", rejected)).id, actorId: u.yosep, reason: "Project salah" });
    const before = await overtime(rejected);
    expect(before.status).toBe("REJECTED");
    const [row] = (await listOvertimes(testDb, actors.andi.employeeId, "2026-10")).filter((r) => r.id === rejected);
    expect(row.rejection).toMatchObject({ reason: "Project salah" });

    await finishOvertime(testDb, actors.andi, rejected, finish("Perbaikan switch"), at("2026-10-22T08:00"));
    expect(await overtime(rejected)).toMatchObject({ status: "PENDING", number: before.number, clockOut: before.clockOut, activity: "Perbaikan switch" });
    expect((await approvalOf("OVERTIME", rejected)).status).toBe("PENDING");
  });
});

describe("reimburse overtime (2026-10-30)", () => {
  const withOvertime = (overtimeIds: string[]) => reimbursementSchema.parse({ note: "", items: [], overtimeIds });

  it("hanya overtime yang sudah disetujui; tidak bisa dicampur baris biasa", async () => {
    const pending = await session("2026-10-20T18:00", "2026-10-20T19:00");
    await expect(saveReimbursementDraft(testDb, actors.andi, null, withOvertime([pending]))).rejects.toThrow("belum disetujui approver");
    expect(await listReimbursableOvertimes(testDb, actors.andi.employeeId!, null)).toHaveLength(0);

    const approved = await approvedSession("2026-10-21T18:00", "2026-10-21T19:00");
    const typeId = (await testDb.reimburseType.findUniqueOrThrow({ where: { code: "TRANSPORT" } })).id;
    const mixed = reimbursementSchema.parse({
      note: "",
      items: [{ date: "2026-10-21", customerId, projectId: "", activity: "Tol", participants: "", location: "Jakarta", typeId, hasReceipt: false, paymentMethod: "PERSONAL", amount: 1 }],
      overtimeIds: [approved],
    });
    await expect(saveReimbursementDraft(testDb, actors.andi, null, mixed)).rejects.toThrow("tidak bisa dicampur");
  });

  it("baris dari data sesi, nominal 0 sampai diisi Ci Ika; alur Ci Ika; nominal wajib diisi saat menyetujui", async () => {
    const first = await approvedSession("2026-10-20T18:00", "2026-10-20T19:30");
    const second = await approvedSession("2026-10-24T10:00", "2026-10-24T12:00");
    const { reimbursementId } = await saveReimbursementDraft(testDb, actors.andi, null, withOvertime([first, second]));
    const items = await testDb.reimbursementItem.findMany({ where: { reimbursementId }, orderBy: { id: "asc" }, include: { type: true } });
    expect(items).toMatchObject([
      { overtimeId: first, customerId, projectId, activity: "Migrasi router", amount: 0n, type: { code: "OVERTIME" } },
      { overtimeId: second, amount: 0n },
    ]);

    await submitReimbursement(testDb, actors.andi, reimbursementId);
    const request = await approvalOf("REIMBURSE", reimbursementId);
    expect(request.steps.map((s) => s.approverIds)).toEqual([[u.ika]]);
    const [queued] = await listMyApprovalQueue(testDb, u.ika);
    expect(queued.overtimeLines?.map((l) => [l.itemId, l.amount])).toEqual(items.map((i) => [i.id, null]));

    await expect(approveRequest(testDb, { requestId: request.id, actorId: u.ika })).rejects.toThrow("Isi nominal semua overtime");
    await expect(approveRequest(testDb, { requestId: request.id, actorId: u.ika, overtimeAmounts: { [items[0].id]: 150_000 } })).rejects.toThrow(
      "Isi nominal semua overtime",
    );
    await approveRequest(testDb, { requestId: request.id, actorId: u.ika, overtimeAmounts: { [items[0].id]: 150_000, [items[1].id]: 300_000 } });

    expect(await testDb.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId } })).toMatchObject({ status: "APPROVED", total: 450_000n, totalPersonal: 450_000n });
    const corrections = (await listCorrections(testDb, [request.id])).get(request.id) ?? [];
    expect(corrections.map((c) => [c.label, c.before, c.after])).toEqual([
      ["Overtime 2026-10-20 · Nominal", "Rp 0", "Rp 150.000"],
      ["Overtime 2026-10-24 · Nominal", "Rp 0", "Rp 300.000"],
    ]);
    // Persetujuan overtime yang sudah di-reimburse tidak bisa dibatalkan.
    await expect(revokeApproval(testDb, { requestId: (await approvalOf("OVERTIME", first)).id, actorId: u.yosep, reason: "Salah" })).rejects.toThrow(
      "sudah dipakai di reimburse",
    );
  });

  it("satu sesi hanya sekali; draft dihapus → bisa dipilih lagi; tipe Overtime tidak bisa dipilih manual", async () => {
    const done = await approvedSession("2026-10-20T18:00", "2026-10-20T19:30");
    const { reimbursementId } = await saveReimbursementDraft(testDb, actors.andi, null, withOvertime([done]));
    await saveReimbursementDraft(testDb, actors.andi, reimbursementId, withOvertime([done]));
    await expect(saveReimbursementDraft(testDb, actors.andi, null, withOvertime([done]))).rejects.toThrow("sudah dipakai di draft reimburse lain");
    expect(await listReimbursableOvertimes(testDb, actors.andi.employeeId!, null)).toHaveLength(0);
    expect((await listReimbursableOvertimes(testDb, actors.andi.employeeId!, reimbursementId)).map((o) => o.id)).toEqual([done]);
    await deleteReimbursementDraft(testDb, actors.andi, reimbursementId);
    expect(await listReimbursableOvertimes(testDb, actors.andi.employeeId!, null)).toHaveLength(1);

    const options = await getReimbursementFormOptions(testDb, "ENGINEER");
    expect(options.types.some((t) => t.code === "OVERTIME")).toBe(false);
    const overtimeType = await testDb.$transaction((tx) => overtimeReimburseType(tx));
    const manual = reimbursementSchema.parse({
      note: "",
      items: [{ date: "2026-10-20", customerId, projectId: "", activity: "Lembur", participants: "-", location: "Jakarta", typeId: overtimeType.id, hasReceipt: false, paymentMethod: "PERSONAL", amount: 1 }],
    });
    await expect(saveReimbursementDraft(testDb, actors.andi, null, manual)).rejects.toThrow("tipe reimburse tidak tersedia");
  });
});
