// Overtime engineer (2026-10-30): clock out = finalize (customer + project + pekerjaan).
import { z } from "zod";
import { amountSchema, textSchema } from "./common";

export const overtimeFinishSchema = z.object({
  customerId: z.string({ error: "Customer wajib dipilih" }).min(1, { error: "Customer wajib dipilih" }),
  projectId: z.string({ error: "Project wajib dipilih" }).min(1, { error: "Project wajib dipilih" }),
  activity: textSchema("Pekerjaan", { min: 2, max: 300 }),
});
export type OvertimeFinishInput = z.infer<typeof overtimeFinishSchema>;

/**
 * Tarif overtime per jam (Rupiah), diatur Admin di Setting → Jam Kerja & Absensi. Weekday = Senin–Jumat hari kerja;
 * weekend = Sabtu, Minggu, dan hari libur (`Holiday`), menurut tanggal mulai overtime (2026-10-30).
 */
export const overtimeRateSchema = z.object({ weekday: amountSchema, weekend: amountSchema });
export type OvertimeRates = z.infer<typeof overtimeRateSchema>;

/** Tarif yang berlaku untuk sesi di hari kerja (`workday`) atau weekend/libur; 0 = belum diatur. */
export function overtimeRateFor(rates: OvertimeRates, workday: boolean): number {
  return workday ? rates.weekday : rates.weekend;
}

/** Durasi sesi dalam menit penuh. */
export function overtimeMinutes(clockIn: Date, clockOut: Date): number {
  return Math.max(0, Math.floor((clockOut.getTime() - clockIn.getTime()) / 60_000));
}

/** Nominal reimburse overtime = durasi × tarif per jam, dihitung per menit lalu dibulatkan ke rupiah terdekat. */
export function overtimeAmount(minutes: number, hourlyRate: number): number {
  return Math.round((minutes * hourlyRate) / 60);
}
