// Reimburse — URD RMB-02..05, Tech Spec §6.4. Schema yang sama untuk simpan draft & ajukan;
// aturan tambahan saat ajukan (min 1 baris, kwitansi wajib ada filenya) dicek di service.
import { z } from "zod";
import { PaymentMethod } from "@/generated/prisma/enums";
import { amountSchema, isoDateSchema, optionalField, textSchema } from "./common";

/** Pilihan project khusus: prospek New Acquisition (tanpa project di master). */
export const NEW_ACQUISITION = "__new_acquisition__";

/** Satu baris tersimpan (ReimbursementItem). Header kunjungan disalin ke tiap baris. */
export const reimbursementItemSchema = z.object({
  date: isoDateSchema,
  /** Company/Customer dari master (Fase 14: wajib, dropdown). */
  customerId: z.string({ error: "Company wajib dipilih" }).min(1, { error: "Company wajib dipilih" }),
  projectId: optionalField(z.string()),
  /** Prospek New Acquisition tanpa project (tidak boleh bersamaan dengan projectId). */
  newAcquisition: z.boolean().default(false),
  activity: textSchema("Aktivitas", { min: 2, max: 300 }),
  participants: textSchema("Nama – jabatan", { min: 2, max: 500 }),
  location: textSchema("Lokasi", { min: 2, max: 150 }),
  typeId: z.string({ error: "Tipe wajib dipilih" }).min(1, { error: "Tipe wajib dipilih" }),
  hasReceipt: z.boolean(),
  paymentMethod: z.enum(PaymentMethod, { error: "Pembayaran wajib dipilih" }),
  amount: amountSchema,
});
export type ReimbursementItemInput = z.infer<typeof reimbursementItemSchema>;

export const reimbursementSchema = z.object({
  note: optionalField(textSchema("Catatan", { max: 500 })),
  items: z.array(reimbursementItemSchema).max(50, { error: "Maksimal 50 baris per pengajuan" }),
});
export type ReimbursementInput = z.infer<typeof reimbursementSchema>;

/**
 * Form reimburse (Fase 14, keputusan user 2026-10-05): beberapa KUNJUNGAN (tanggal + company +
 * project / New Acquisition), masing-masing berisi beberapa BARIS (tipe, payment, total, lokasi,
 * nama – jabatan, aktivitas). Output = baris datar `reimbursementSchema`.
 */
export const reimbursementLineSchema = reimbursementItemSchema.pick({
  activity: true,
  participants: true,
  location: true,
  typeId: true,
  hasReceipt: true,
  paymentMethod: true,
  amount: true,
});

export const reimbursementVisitSchema = z.object({
  date: isoDateSchema,
  customerId: z.string({ error: "Company wajib dipilih" }).min(1, { error: "Company wajib dipilih" }),
  /** "" = tanpa project, NEW_ACQUISITION = prospek, selain itu id project. */
  project: z.string(),
  lines: z.array(reimbursementLineSchema).min(1, { error: "Minimal 1 baris" }),
});

export const reimbursementFormSchema = z
  .object({
    note: optionalField(textSchema("Catatan", { max: 500 })),
    visits: z.array(reimbursementVisitSchema),
  })
  .superRefine((v, ctx) => {
    if (v.visits.reduce((n, visit) => n + visit.lines.length, 0) > 50) ctx.addIssue({ code: "custom", path: ["visits"], message: "Maksimal 50 baris per pengajuan" });
  })
  .transform(
    (v): ReimbursementInput => ({
      note: v.note,
      items: v.visits.flatMap((visit) =>
        visit.lines.map((line) => ({
          ...line,
          date: visit.date,
          customerId: visit.customerId,
          projectId: visit.project && visit.project !== NEW_ACQUISITION ? visit.project : null,
          newAcquisition: visit.project === NEW_ACQUISITION,
        })),
      ),
    }),
  );

/** Baris tersimpan → kunjungan untuk form edit: baris berurutan dengan header sama digabung. */
export function itemsToVisits<T extends { date: string; customerId: string | null; projectId: string | null; newAcquisition: boolean }>(items: T[]) {
  const visits: { date: string; customerId: string; project: string; lines: T[] }[] = [];
  for (const item of items) {
    const project = item.newAcquisition ? NEW_ACQUISITION : (item.projectId ?? "");
    const last = visits.at(-1);
    if (last && last.date === item.date && last.customerId === (item.customerId ?? "") && last.project === project) last.lines.push(item);
    else visits.push({ date: item.date, customerId: item.customerId ?? "", project, lines: [item] });
  }
  return visits;
}

/** Subtotal Cash / CC / Total (RMB-06). Dipakai client (tampilan) & server (nilai yang disimpan). */
export function reimbursementTotals(items: { paymentMethod: PaymentMethod | string; amount: number | null | undefined }[]) {
  let cash = 0;
  let cc = 0;
  for (const item of items) {
    const amount = Number.isFinite(item.amount) ? Number(item.amount) : 0;
    if (item.paymentMethod === "CC") cc += amount;
    else cash += amount;
  }
  return { cash, cc, total: cash + cc };
}

/** Subtotal per tanggal transaksi (Fase 14), urut tanggal. Baris tanpa tanggal/nominal diabaikan. */
export function dailySubtotals(items: { date: string; amount: number | null | undefined }[]) {
  const byDate = new Map<string, number>();
  for (const item of items) {
    const amount = Number.isFinite(item.amount) ? Number(item.amount) : 0;
    if (!item.date || !amount) continue;
    byDate.set(item.date, (byDate.get(item.date) ?? 0) + amount);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount }));
}
