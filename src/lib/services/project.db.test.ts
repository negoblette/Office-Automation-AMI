import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { approveRequest } from "@/lib/services/approval";
import { saveHealthCategory, saveReimburseType, typeCodeFromName } from "@/lib/services/master-data";
import { deleteCustomer, projectTotals, saveCustomer, saveProject, submitProjectExpense, submitProjectRevenue } from "@/lib/services/project";
import { saveReimbursementDraft, submitReimbursement } from "@/lib/services/reimbursement";
import { projectExpenseSchema, projectRevenueSchema, projectSchema, reimburseTypeSchema } from "@/lib/validators/project";
import { reimbursementSchema } from "@/lib/validators/reimbursement";
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

async function newProject(name = "Core Network") {
  const customer = await saveCustomer(testDb, u.yosep, null, "PT Bank Mandiri");
  return saveProject(testDb, u.yosep, null, projectSchema.parse({ customerId: customer.id, name, type: "RUNNING", isActive: true }));
}
const approveAll = async (entityId: string, module: "EXPENSE" | "REVENUE" | "REIMBURSE") => {
  const request = await testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module, entityId } } });
  for (const step of await testDb.approvalRequestStep.findMany({ where: { requestId: request.id }, orderBy: { level: "asc" } })) {
    if (step.status === "SKIPPED") continue;
    await approveRequest(testDb, { requestId: request.id, actorId: step.approverIds[0] });
  }
};

describe("customer & project (PRJ-01)", () => {
  it("nama customer unik (tanpa beda huruf besar/kecil); project unik per customer", async () => {
    const project = await newProject();
    await expect(saveCustomer(testDb, u.yosep, null, "pt bank mandiri")).rejects.toThrow("Nama customer sudah terdaftar");
    await expect(
      saveProject(testDb, u.yosep, null, projectSchema.parse({ customerId: project.customerId, name: "core network", type: "NEW_ACQUISITION", isActive: true })),
    ).rejects.toThrow("Project dengan nama ini sudah ada");
    await expect(deleteCustomer(testDb, u.yosep, project.customerId)).rejects.toThrow("tidak bisa dihapus");
  });
});

describe("expense & revenue (PRJ-02..04)", () => {
  it("hanya Admin; nomor EXP/REV; lewat approval (Yosep: L1 dilewati → Rudy); status APPROVED setelah final", async () => {
    const project = await newProject();
    const expenseInput = projectExpenseSchema.parse({ date: "2026-09-10", description: "Tiket pesawat onsite", paymentMethod: "CC", amount: "3.000.000" });
    await expect(submitProjectExpense(testDb, actors.andi, project.id, expenseInput)).rejects.toThrow("Hanya Admin");

    const expense = await submitProjectExpense(testDb, actors.yosep, project.id, expenseInput);
    expect(expense.number).toMatch(/^EXP\/\d{4}\/\d{2}\/0001$/);
    const revenue = await submitProjectRevenue(testDb, actors.yosep, project.id, projectRevenueSchema.parse({ date: "2026-09-15", description: "Termin 1", amount: 50_000_000 }));
    expect(revenue.number).toMatch(/^REV\//);

    expect(await projectTotals(testDb, project.id)).toMatchObject({ expense: 0, revenue: 0, pendingExpense: 3_000_000, pendingRevenue: 50_000_000 });
    await approveAll(expense.id, "EXPENSE");
    await approveAll(revenue.id, "REVENUE");
    expect((await testDb.projectExpense.findUniqueOrThrow({ where: { id: expense.id } })).status).toBe("APPROVED");
    expect(await projectTotals(testDb, project.id)).toMatchObject({ directExpense: 3_000_000, revenue: 50_000_000, margin: 47_000_000 });
  });

  it("PRJ-03: baris reimburse APPROVED yang memilih project ikut total expense (yang PENDING belum)", async () => {
    const project = await newProject();
    const typeId = (await testDb.reimburseType.findUniqueOrThrow({ where: { code: "TRANSPORT" } })).id;
    const row = (amount: number, projectId = "") => ({
      date: "2026-09-12", customerName: "", projectId, activity: "Onsite", participants: "Andi – Engineer", location: "Jakarta",
      typeId, hasReceipt: false, paymentMethod: "CASH", amount, receiptFileKey: "", receiptFileName: "",
    });
    // 1 pengajuan: 2 baris ke project + 1 baris tanpa project.
    const draft = await saveReimbursementDraft(testDb, actors.andi, null, reimbursementSchema.parse({ note: "", items: [row(200_000, project.id), row(300_000, project.id), row(999_000)] }));
    await submitReimbursement(testDb, actors.andi, draft.reimbursementId);
    expect((await projectTotals(testDb, project.id)).reimburse).toBe(0); // masih PENDING

    await approveAll(draft.reimbursementId, "REIMBURSE");
    expect(await projectTotals(testDb, project.id)).toMatchObject({ reimburse: 500_000, expense: 500_000 });
    // Customer baris reimburse mengikuti project.
    const items = await testDb.reimbursementItem.findMany({ where: { projectId: project.id } });
    expect(new Set(items.map((i) => i.customerId))).toEqual(new Set([project.customerId]));
  });

  it("project nonaktif tidak bisa diberi expense baru", async () => {
    const project = await newProject();
    await saveProject(testDb, u.yosep, project.id, projectSchema.parse({ customerId: project.customerId, name: project.name, type: "RUNNING", isActive: false }));
    await expect(
      submitProjectExpense(testDb, actors.yosep, project.id, projectExpenseSchema.parse({ date: "2026-09-10", description: "Parkir", paymentMethod: "CASH", amount: 50_000 })),
    ).rejects.toThrow("Project sudah tidak aktif");
  });
});

describe("master data (SET-05)", () => {
  it("tipe reimburse baru: kode dari nama, divisi dipilih; nama unik", async () => {
    expect(typeCodeFromName("Parkir & Tol")).toBe("PARKIR_TOL");
    const type = await saveReimburseType(testDb, u.yosep, null, reimburseTypeSchema.parse({ name: "Parkir & Tol", divisions: ["ENGINEER", "SALES"], isActive: true }));
    expect(type).toMatchObject({ code: "PARKIR_TOL", divisions: ["ENGINEER", "SALES"] });
    await expect(saveReimburseType(testDb, u.yosep, null, reimburseTypeSchema.parse({ name: "parkir & tol", divisions: ["UMUM"], isActive: true }))).rejects.toThrow("Nama tipe sudah ada");
    await saveReimburseType(testDb, u.yosep, type.id, reimburseTypeSchema.parse({ name: "Parkir & Tol", divisions: ["ENGINEER"], isActive: false }));
    expect((await testDb.reimburseType.findUniqueOrThrow({ where: { id: type.id } })).isActive).toBe(false);
  });

  it("kategori klaim: tambah & nonaktifkan; nama unik", async () => {
    const category = await saveHealthCategory(testDb, u.ika, null, { name: "Gigi", isActive: true });
    await expect(saveHealthCategory(testDb, u.ika, null, { name: "gigi", isActive: true })).rejects.toThrow("Nama kategori sudah ada");
    await saveHealthCategory(testDb, u.ika, category.id, { name: "Perawatan Gigi", isActive: false });
    expect(await testDb.healthCategory.findUniqueOrThrow({ where: { id: category.id } })).toMatchObject({ name: "Perawatan Gigi", isActive: false });
  });
});
