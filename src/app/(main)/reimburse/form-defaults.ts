// Nilai awal form reimburse. Sengaja BUKAN modul "use client": dipakai halaman server
// (/reimburse/baru, edit) maupun form di client (tombol Tambah Baris / Tambah Kunjungan).
import type { z } from "zod";
import { toJakartaIsoDate } from "@/lib/format";
import type { reimbursementFormSchema } from "@/lib/validators/reimbursement";

export type ReimbursementFormValues = z.input<typeof reimbursementFormSchema>;
export type ReimbursementVisitValues = ReimbursementFormValues["visits"][number];
export type ReimbursementLineValues = ReimbursementVisitValues["lines"][number];

/** Satu baris kosong: payment Cash, tanpa kwitansi. */
export function emptyLine(): ReimbursementLineValues {
  return {
    activity: "",
    participants: "",
    location: "",
    typeId: "",
    hasReceipt: false,
    paymentMethod: "CASH",
    amount: null as unknown as number,
  };
}

/** Satu kunjungan kosong: tanggal hari ini (WIB), company & project belum dipilih, 1 baris. */
export function emptyVisit(date = toJakartaIsoDate()): ReimbursementVisitValues {
  return { date, customerId: "", project: "", lines: [emptyLine()] };
}
