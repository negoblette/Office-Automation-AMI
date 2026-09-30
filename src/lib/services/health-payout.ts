// Jadwal pembayaran klaim kesehatan (HealthPayout) — Tech Spec §6.3. Tidak mengimpor approval
// engine supaya bisa dipakai approval-effects.ts tanpa import melingkar.
import type { Prisma } from "@/generated/prisma/client";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { ServiceError } from "./errors";

type Tx = Prisma.TransactionClient;

/** "YYYY-MM" → Date tanggal 1 (kolom @db.Date `periodMonth`). */
export function monthToDate(yearMonth: string): Date {
  return fromIsoDate(`${yearMonth}-01`);
}

export async function lockPlafond(tx: Tx, employeeId: string, year: number) {
  const plafond = await tx.healthPlafond.findUnique({ where: { employeeId_year: { employeeId, year } } });
  if (!plafond) throw new ServiceError(`Plafon kesehatan tahun ${year} belum diatur. Hubungi Admin.`);
  // Kunci baris plafon: submit & penjadwalan untuk karyawan yang sama berjalan berurutan.
  await tx.$queryRaw`SELECT id FROM "HealthPlafond" WHERE id = ${plafond.id} FOR UPDATE`;
  return plafond;
}

/**
 * Efek final HEALTH (Tech Spec §4.3, v1.14): nominal disetujui + status APPROVED + satu HealthPayout sebesar nominal disetujui
 * di bulan approval (Asia/Jakarta). Plafon hanya tahunan (keputusan user 2026-09-29) — batas
 * plafon sudah dicek saat submit, jadi klaim dibayar penuh tanpa dipecah per bulan.
 */
export async function applyApprovedHealthClaim(tx: Tx, claimId: string, approvedAt: Date, approvedAmount: number | null = null) {
  const requested = await tx.healthClaim.findUniqueOrThrow({ where: { id: claimId }, select: { amount: true } });
  // v1.14: approver boleh menyetujui nominal lebih kecil dari yang diajukan (tidak boleh lebih besar).
  const approved = approvedAmount === null ? requested.amount : BigInt(approvedAmount);
  if (approved <= 0n || approved > requested.amount) {
    throw new ServiceError("Nominal disetujui harus lebih dari 0 dan tidak melebihi nominal diajukan", "approvedAmount");
  }
  const claim = await tx.healthClaim.update({ where: { id: claimId }, data: { status: "APPROVED", approvedAt, approvedAmount: approved } });
  const claimYear = Number(toJakartaIsoDate(claim.claimDate).slice(0, 4));
  await lockPlafond(tx, claim.employeeId, claimYear);
  await tx.healthPayout.create({
    data: {
      claimId: claim.id,
      employeeId: claim.employeeId,
      periodMonth: monthToDate(toJakartaIsoDate(approvedAt).slice(0, 7)),
      amount: approved,
    },
  });
}
