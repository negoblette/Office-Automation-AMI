// Penyesuaian saldo cuti oleh Admin (Fase 14; "atur sisa" 2026-10-28). Saldo boleh minus.
import type { PrismaClient } from "@/generated/prisma/client";
import { toJakartaIsoDate } from "@/lib/format";
import type { LeaveAdjustmentFormInput } from "@/lib/validators/leave";
import { ServiceError } from "./errors";
import { addLeaveAdjustment } from "./leave-balance";
import { getCurrentBalances } from "./leave-queries";

/**
 * `SET`: sisa cuti periode berjalan diatur menjadi `days` — selisih terhadap sisa sekarang (yang sudah dikurangi cuti
 * menunggu approval) dicatat sebagai satu penyesuaian MANUAL. `DELTA`: tambah/kurangi langsung.
 */
export async function adjustLeaveBalance(db: PrismaClient, actorId: string, employeeId: string, input: LeaveAdjustmentFormInput) {
  let days = input.days;
  let reason = input.reason;
  if (input.mode === "SET") {
    const [balance] = await getCurrentBalances(db, [employeeId]);
    if (!balance) throw new ServiceError("Saldo cuti karyawan tidak ditemukan");
    days = input.days - balance.remaining;
    if (days === 0) throw new ServiceError(`Sisa cuti sudah ${input.days} hari`, "days");
    reason = `Sisa diatur menjadi ${input.days} hari (sebelumnya ${balance.remaining}): ${input.reason}`;
  }
  return db.$transaction((tx) =>
    addLeaveAdjustment(tx, { employeeId, refIso: toJakartaIsoDate(), days, reason, source: "MANUAL", createdById: actorId }),
  );
}
