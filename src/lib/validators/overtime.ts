// Overtime engineer (2026-10-30): clock out = finalize (customer + project + pekerjaan) → approval Ko Yosep.
import { z } from "zod";
import { optionalField, textSchema } from "./common";
import type { ReimbursementInput } from "./reimbursement";

export const overtimeFinishSchema = z.object({
  customerId: z.string({ error: "Customer wajib dipilih" }).min(1, { error: "Customer wajib dipilih" }),
  projectId: z.string({ error: "Project wajib dipilih" }).min(1, { error: "Project wajib dipilih" }),
  activity: textSchema("Pekerjaan", { min: 2, max: 300 }),
});
export type OvertimeFinishInput = z.infer<typeof overtimeFinishSchema>;

/**
 * Form Reimburse Overtime: pengajuan terpisah berisi sesi overtime yang sudah disetujui; nominal diisi approver
 * (Ci Ika). Output = `reimbursementSchema` tanpa baris biasa.
 */
export const overtimeReimbursementFormSchema = z
  .object({
    note: optionalField(textSchema("Catatan", { max: 500 })),
    overtimeIds: z.array(z.string().min(1)).min(1, { error: "Pilih minimal 1 overtime" }).max(50, { error: "Maksimal 50 overtime per pengajuan" }),
  })
  .transform((v): ReimbursementInput => ({ note: v.note, items: [], overtimeIds: v.overtimeIds }));

/** Durasi sesi dalam menit penuh. */
export function overtimeMinutes(clockIn: Date, clockOut: Date): number {
  return Math.max(0, Math.floor((clockOut.getTime() - clockIn.getTime()) / 60_000));
}
