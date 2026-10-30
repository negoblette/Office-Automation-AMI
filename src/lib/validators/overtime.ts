// Overtime engineer (2026-10-30): clock out = finalize (customer + project + pekerjaan).
import { z } from "zod";
import { amountSchema, textSchema } from "./common";

export const overtimeFinishSchema = z.object({
  customerId: z.string({ error: "Customer wajib dipilih" }).min(1, { error: "Customer wajib dipilih" }),
  projectId: z.string({ error: "Project wajib dipilih" }).min(1, { error: "Project wajib dipilih" }),
  activity: textSchema("Pekerjaan", { min: 2, max: 300 }),
});
export type OvertimeFinishInput = z.infer<typeof overtimeFinishSchema>;

/** Tarif overtime per jam (Rupiah), diatur Admin di Setting → Jam Kerja & Absensi. */
export const overtimeRateSchema = z.object({ hourlyRate: amountSchema });
export type OvertimeRateInput = z.infer<typeof overtimeRateSchema>;

/** Durasi sesi dalam menit penuh. */
export function overtimeMinutes(clockIn: Date, clockOut: Date): number {
  return Math.max(0, Math.floor((clockOut.getTime() - clockIn.getTime()) / 60_000));
}

/** Nominal reimburse overtime = durasi × tarif per jam, dihitung per menit lalu dibulatkan ke rupiah terdekat. */
export function overtimeAmount(minutes: number, hourlyRate: number): number {
  return Math.round((minutes * hourlyRate) / 60);
}
