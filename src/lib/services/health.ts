// Klaim kesehatan — URD HC-01..08, Tech Spec §6.3. Diajukan langsung ke approval engine (Ika;
// klaim Ika sendiri → FALLBACK Rudy/Leonard).
import type { PrismaClient } from "@/generated/prisma/client";
import { formatRupiah, fromIsoDate } from "@/lib/format";
import { remainingPlafond } from "@/lib/health";
import type { HealthClaimInput, HealthPlafondInput } from "@/lib/validators/health";
import { type Actor, assertFileKeyAvailable } from "./access";
import { type ApprovalNotification, buildApproval } from "./approval";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { lockPlafond } from "./health-payout";
import { nextDocumentNumber } from "./numbering";

/**
 * Pemakaian plafon karyawan pada tahun klaim (HC-07): klaim APPROVED dihitung dari nominal
 * disetujui, klaim PENDING dari nominal diajukan (v1.14).
 */
export async function usedOrPendingAmount(db: Pick<PrismaClient, "healthClaim">, employeeId: string, year: number) {
  const grouped = await db.healthClaim.groupBy({
    by: ["status"],
    _sum: { amount: true, approvedAmount: true },
    where: {
      employeeId,
      status: { in: ["APPROVED", "PENDING"] },
      claimDate: { gte: fromIsoDate(`${year}-01-01`), lte: fromIsoDate(`${year}-12-31`) },
    },
  });
  return grouped.reduce((sum, g) => sum + Number((g.status === "APPROVED" ? g._sum.approvedAmount : g._sum.amount) ?? 0), 0);
}

export type SubmitHealthClaimResult = {
  claimId: string;
  number: string;
  status: "PENDING" | "APPROVED";
  notifications: ApprovalNotification[];
};

export async function submitHealthClaim(
  db: PrismaClient,
  actor: Actor,
  input: HealthClaimInput,
): Promise<SubmitHealthClaimResult> {
  if (!actor.employeeId) throw new ServiceError("Akun Anda belum terhubung ke data karyawan");
  const employeeId = actor.employeeId;

  return db.$transaction(async (tx) => {
    const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: { status: true } });
    if (employee?.status !== "ACTIVE") throw new ServiceError("Hanya karyawan aktif yang bisa mengajukan klaim");

    const category = await tx.healthCategory.findUnique({ where: { id: input.categoryId } });
    if (!category?.isActive) throw new ServiceError("Kategori klaim tidak tersedia", "categoryId");
    await assertFileKeyAvailable(tx, input.invoiceFileKey);

    // HC-07: total klaim dibatasi plafon tahunan (tahun tanggal klaim).
    const year = Number(input.claimDate.slice(0, 4));
    const plafond = await lockPlafond(tx, employeeId, year);
    const remaining = remainingPlafond(Number(plafond.annualAmount), await usedOrPendingAmount(tx, employeeId, year));
    if (input.amount > remaining) {
      throw new ServiceError(`Sisa plafon ${year} ${formatRupiah(Math.max(0, remaining))}, klaim ${formatRupiah(input.amount)}`, "amount");
    }

    const number = await nextDocumentNumber(tx, "HC");
    const claim = await tx.healthClaim.create({
      data: {
        number,
        employeeId,
        categoryId: input.categoryId,
        claimDate: fromIsoDate(input.claimDate),
        amount: BigInt(input.amount),
        invoiceFileKey: input.invoiceFileKey,
        invoiceFileName: input.invoiceFileName,
        note: input.note,
        status: "PENDING",
        submittedAt: new Date(),
      },
    });
    const approval = await buildApproval(tx, { module: "HEALTH", entityId: claim.id, entityNumber: number, requesterId: actor.id });
    await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "HealthClaim", entityId: claim.id, after: claim });
    return { claimId: claim.id, number, status: approval.status, notifications: approval.notifications };
  });
}

/**
 * Atur plafon tahunan karyawan (HC-01). Plafon bulanan dihitung otomatis (OI-04). Plafon baru
 * tidak boleh lebih kecil dari klaim yang sudah disetujui/menunggu tahun itu.
 */
export async function setHealthPlafond(db: PrismaClient, actorId: string, input: HealthPlafondInput) {
  return db.$transaction(async (tx) => {
    const employee = await tx.employee.findUnique({ where: { id: input.employeeId }, select: { id: true } });
    if (!employee) throw new ServiceError("Karyawan tidak ditemukan");
    const used = await usedOrPendingAmount(tx, input.employeeId, input.year);
    if (input.annualAmount < used) {
      throw new ServiceError(`Plafon tidak boleh di bawah klaim yang sudah diajukan tahun ${input.year} (${formatRupiah(used)})`, "annualAmount");
    }

    const key = { employeeId_year: { employeeId: input.employeeId, year: input.year } };
    const before = await tx.healthPlafond.findUnique({ where: key });
    const data = { annualAmount: BigInt(input.annualAmount) };
    const after = await tx.healthPlafond.upsert({ where: key, create: { employeeId: input.employeeId, year: input.year, ...data }, update: data });
    await logAudit(tx, { actorId, action: before ? "UPDATE" : "CREATE", entity: "HealthPlafond", entityId: after.id, before, after });
    return after;
  });
}

/** Tandai pembayaran bulan tertentu sudah/ belum dibayar (halaman Jadwal Pembayaran, Finance). */
export async function setPayoutPaid(db: PrismaClient, actorId: string, payoutId: string, paid: boolean) {
  return db.$transaction(async (tx) => {
    const before = await tx.healthPayout.findUnique({ where: { id: payoutId } });
    if (!before) throw new ServiceError("Jadwal pembayaran tidak ditemukan");
    const after = await tx.healthPayout.update({ where: { id: payoutId }, data: { paidAt: paid ? new Date() : null } });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "HealthPayout", entityId: payoutId, before, after });
  });
}
