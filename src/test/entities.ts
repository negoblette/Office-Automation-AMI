// Entitas nyata per modul approval untuk test engine/email. Efek final (approval-effects.ts)
// meng-update tabel modul, jadi entityId harus menunjuk ke baris yang benar-benar ada.
import { randomUUID } from "node:crypto";
import type { ApprovalModule } from "@/generated/prisma/client";
import { testDb } from "./db";

/** Buat entitas minimal milik `requesterUserId` untuk modul; kembalikan id-nya. */
export async function createApprovalEntity(module: ApprovalModule, requesterUserId: string): Promise<string> {
  const user = await testDb.user.findUniqueOrThrow({ where: { id: requesterUserId }, include: { employee: true } });
  switch (module) {
    case "REIMBURSE": {
      const reimbursement = await testDb.reimbursement.create({
        data: { employeeId: user.employeeId!, division: user.employee!.division, number: `DRAFT-${randomUUID()}`, status: "PENDING" },
      });
      return reimbursement.id;
    }
    case "LEAVE": {
      const request = await testDb.leaveRequest.create({
        data: {
          number: `UJI-${randomUUID()}`,
          employeeId: user.employeeId!,
          startDate: new Date(),
          endDate: new Date(),
          workingDays: 1,
          reason: "uji",
          status: "PENDING",
        },
      });
      return request.id;
    }
    case "HEALTH": {
      const year = new Date().getFullYear();
      await testDb.healthPlafond.upsert({
        where: { employeeId_year: { employeeId: user.employeeId!, year } },
        create: { employeeId: user.employeeId!, year, annualAmount: 12_000_000n },
        update: {},
      });
      const category = await testDb.healthCategory.findFirstOrThrow();
      const claim = await testDb.healthClaim.create({
        data: {
          number: `UJI-${randomUUID()}`,
          employeeId: user.employeeId!,
          categoryId: category.id,
          claimDate: new Date(),
          amount: 100_000n,
          invoiceFileKey: `${randomUUID()}.pdf`,
          invoiceFileName: "invoice.pdf",
          status: "PENDING",
        },
      });
      return claim.id;
    }
    case "EXPENSE":
    case "REVENUE": {
      const customer = await testDb.customer.upsert({ where: { name: "UJI Customer" }, create: { name: "UJI Customer" }, update: {} });
      const project = await testDb.project.upsert({
        where: { customerId_name: { customerId: customer.id, name: "UJI Project" } },
        create: { customerId: customer.id, name: "UJI Project", type: "RUNNING" },
        update: {},
      });
      const data = { number: `UJI-${randomUUID()}`, projectId: project.id, date: new Date(), description: "uji", amount: 100_000n, status: "PENDING" as const, createdById: requesterUserId };
      return module === "EXPENSE"
        ? (await testDb.projectExpense.create({ data: { ...data, paymentMethod: "CASH" } })).id
        : (await testDb.projectRevenue.create({ data })).id;
    }
    case "CERTIFICATE": {
      const certificate = await testDb.certificate.create({
        data: { employeeId: user.employeeId!, type: "PROFESSIONAL", name: "Sertifikat Uji", startDate: new Date(), endDate: new Date(Date.now() + 365 * 86_400_000) },
      });
      return certificate.id;
    }
    case "ATTENDANCE_APPEAL": {
      const appeal = await testDb.attendanceAppeal.create({
        data: { number: `UJI-${randomUUID()}`, employeeId: user.employeeId!, date: new Date(Date.now() - 86_400_000 * Math.ceil(Math.random() * 300)), reason: "SICK", note: "uji" },
      });
      return appeal.id;
    }
  }
}
