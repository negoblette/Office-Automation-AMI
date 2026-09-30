// Nilai awal form reimburse. Sengaja BUKAN modul "use client": dipakai halaman server
// (/reimburse/baru) maupun form di client (tombol Tambah Baris).
import type { z } from "zod";
import { toJakartaIsoDate } from "@/lib/format";
import type { reimbursementSchema } from "@/lib/validators/reimbursement";

export type ReimbursementFormValues = z.input<typeof reimbursementSchema>;

/** Satu baris kosong: tanggal hari ini (WIB), payment Cash, tanpa kwitansi. */
export function emptyItem(): ReimbursementFormValues["items"][number] {
  return {
    date: toJakartaIsoDate(),
    customerName: "",
    projectId: "",
    activity: "",
    participants: "",
    location: "",
    typeId: "",
    hasReceipt: false,
    paymentMethod: "CASH",
    amount: null as unknown as number,
    receiptFileKey: "",
    receiptFileName: "",
  };
}
