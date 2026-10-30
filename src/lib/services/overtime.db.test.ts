import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { cancelOvertime, finishOvertime, overtimeReimburseType, saveOvertimeRate, startOvertime } from "@/lib/services/overtime";
import { listOvertimes, listReimbursableOvertimes } from "@/lib/services/overtime-queries";
import { saveCustomer, saveProject } from "@/lib/services/project";
import { deleteReimbursementDraft, saveReimbursementDraft, submitReimbursement } from "@/lib/services/reimbursement";
import { getReimbursementFormOptions } from "@/lib/services/reimbursement-queries";
import { overtimeAmount, overtimeFinishSchema } from "@/lib/validators/overtime";
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

/** Satu sesi overtime selesai milik Andi (Engineer). */
async function session(start: string, end: string) {
  const record = await startOvertime(testDb, actors.andi, at(start));
  return finishOvertime(testDb, actors.andi, record.id, finish(), at(end));
}

describe("overtime engineer (2026-10-30)", () => {
  it("nominal = durasi × tarif per jam, dihitung per menit lalu dibulatkan", () => {
    expect(overtimeAmount(90, 50_000)).toBe(75_000);
    expect(overtimeAmount(1, 50_000)).toBe(833);
  });

  it("hanya karyawan divisi Engineer", async () => {
    await expect(startOvertime(testDb, actors.sinta)).rejects.toThrow("Overtime hanya untuk karyawan aktif divisi Engineer");
    await expect(startOvertime(testDb, actors.rudy)).rejects.toThrow("Overtime hanya untuk karyawan aktif divisi Engineer");
  });

  it("beberapa sesi sehari, tapi hanya satu sesi berjalan; clock out wajib customer + project milik customer itu", async () => {
    const first = await startOvertime(testDb, actors.andi, at("2026-10-20T18:00"));
    await expect(startOvertime(testDb, actors.andi, at("2026-10-20T18:05"))).rejects.toThrow("Overtime sebelumnya belum di-clock out");

    const other = (await saveCustomer(testDb, u.ika, null, "PT Lain")).id;
    await expect(finishOvertime(testDb, actors.andi, first.id, overtimeFinishSchema.parse({ customerId: other, projectId, activity: "Kerja" }))).rejects.toThrow(
      "Project bukan milik PT Lain",
    );
    expect(() => overtimeFinishSchema.parse({ customerId, projectId: "", activity: "Kerja" })).toThrow("Project wajib dipilih");

    await finishOvertime(testDb, actors.andi, first.id, finish(), at("2026-10-20T20:00"));
    await expect(finishOvertime(testDb, actors.andi, first.id, finish(), at("2026-10-20T21:00"))).rejects.toThrow("Overtime ini sudah selesai");
    await session("2026-10-20T21:00", "2026-10-20T23:30");

    const rows = await listOvertimes(testDb, actors.andi.employeeId, "2026-10");
    expect(rows.map((r) => [r.date, r.clockIn, r.clockOut, r.minutes, r.customerName, r.projectName])).toEqual([
      ["2026-10-20", "18:00", "20:00", 120, "PT Maju Selaras", "PRJ-01 - Core Network"],
      ["2026-10-20", "21:00", "23:30", 150, "PT Maju Selaras", "PRJ-01 - Core Network"],
    ]);
  });

  it("sesi berjalan bisa dibatalkan pemiliknya; sesi selesai tidak", async () => {
    const open = await startOvertime(testDb, actors.andi);
    await expect(cancelOvertime(testDb, actors.yosep, open.id)).rejects.toThrow("Overtime tidak ditemukan");
    await cancelOvertime(testDb, actors.andi, open.id);
    expect(await testDb.overtime.count()).toBe(0);

    const done = await session("2026-10-20T18:00", "2026-10-20T19:00");
    await expect(cancelOvertime(testDb, actors.andi, done.id)).rejects.toThrow("Overtime ini sudah selesai");
  });
});

describe("reimburse overtime (2026-10-30)", () => {
  const withOvertime = (overtimeIds: string[]) => reimbursementSchema.parse({ note: "", items: [], overtimeIds });

  it("tarif belum diatur → ditolak", async () => {
    const done = await session("2026-10-20T18:00", "2026-10-20T19:30");
    await expect(saveReimbursementDraft(testDb, actors.andi, null, withOvertime([done.id]))).rejects.toThrow("Tarif overtime per jam belum diatur Admin");
  });

  it("overtime terpilih jadi baris tipe Overtime dari data sesi; satu sesi hanya sekali; draft dihapus → bisa dipilih lagi", async () => {
    await saveOvertimeRate(testDb, u.ika, 50_000);
    const done = await session("2026-10-20T18:00", "2026-10-20T19:30");

    const { reimbursementId } = await saveReimbursementDraft(testDb, actors.andi, null, withOvertime([done.id]));
    const r = await testDb.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId }, include: { items: { include: { type: true } } } });
    expect(r.total).toBe(75_000n);
    expect(r.items).toMatchObject([
      { overtimeId: done.id, customerId, projectId, activity: "Migrasi router", paymentMethod: "PERSONAL", amount: 75_000n, type: { code: "OVERTIME" } },
    ]);

    // Ubah draft yang sama → sesi tetap boleh; reimburse lain → ditolak & tidak muncul di pilihan.
    await saveReimbursementDraft(testDb, actors.andi, reimbursementId, withOvertime([done.id]));
    await expect(saveReimbursementDraft(testDb, actors.andi, null, withOvertime([done.id]))).rejects.toThrow("sudah dipakai di draft reimburse lain");
    expect((await listReimbursableOvertimes(testDb, actors.andi.employeeId!, null)).overtimes).toHaveLength(0);
    expect((await listReimbursableOvertimes(testDb, actors.andi.employeeId!, reimbursementId)).overtimes.map((o) => [o.id, o.amount])).toEqual([[done.id, 75_000]]);

    await deleteReimbursementDraft(testDb, actors.andi, reimbursementId);
    expect((await listReimbursableOvertimes(testDb, actors.andi.employeeId!, null)).overtimes).toHaveLength(1);
  });

  it("overtime orang lain / masih berjalan ditolak; tipe Overtime tidak bisa dipilih manual", async () => {
    await saveOvertimeRate(testDb, u.ika, 50_000);
    const open = await startOvertime(testDb, actors.andi);
    await expect(saveReimbursementDraft(testDb, actors.andi, null, withOvertime([open.id]))).rejects.toThrow("Overtime yang belum selesai tidak bisa di-reimburse");
    await expect(saveReimbursementDraft(testDb, actors.yosep, null, withOvertime([open.id]))).rejects.toThrow("Overtime tidak ditemukan");

    const options = await getReimbursementFormOptions(testDb, "ENGINEER");
    expect(options.types.some((t) => t.code === "OVERTIME")).toBe(false);
    const overtimeType = await testDb.$transaction((tx) => overtimeReimburseType(tx));
    const manual = reimbursementSchema.parse({
      note: "",
      items: [{ date: "2026-10-20", customerId, projectId: "", activity: "Lembur", participants: "-", location: "Jakarta", typeId: overtimeType.id, hasReceipt: false, paymentMethod: "PERSONAL", amount: 1 }],
    });
    await expect(saveReimbursementDraft(testDb, actors.andi, null, manual)).rejects.toThrow("tipe reimburse tidak tersedia");
  });

  it("diajukan → status reimburse tampil di riwayat overtime", async () => {
    await saveOvertimeRate(testDb, u.ika, 60_000);
    const done = await session("2026-10-21T18:00", "2026-10-21T19:00");
    const { reimbursementId } = await saveReimbursementDraft(testDb, actors.andi, null, withOvertime([done.id]));
    const { number } = await submitReimbursement(testDb, actors.andi, reimbursementId);
    const [row] = await listOvertimes(testDb, actors.andi.employeeId, "2026-10");
    expect(row.reimbursement).toEqual({ id: reimbursementId, number, status: "PENDING" });
  });
});
