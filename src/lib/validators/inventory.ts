// Masukan Setting → Inventaris & Rak (2026-11-17).
import { z } from "zod";
import { RACK_LIMITS } from "@/lib/inventory";
import { optionalField, textSchema } from "./common";

const count = (label: string, max: number) =>
  z.coerce
    .number({ error: `${label} wajib angka` })
    .int({ error: `${label} harus bilangan bulat` })
    .min(1, { error: `${label} minimal 1` })
    .max(max, { error: `${label} maksimal ${max}` });

/** Rak: nama unik, kolom 1–26 (A–Z), baris 1–50. */
export const rackSchema = z.object({
  name: textSchema("Nama rak", { max: 50 }),
  columns: count("Jumlah kolom", RACK_LIMITS.columns),
  rows: count("Jumlah baris", RACK_LIMITS.rows),
  note: optionalField(textSchema("Catatan", { max: 200 })),
});
export type RackInput = z.infer<typeof rackSchema>;

/** User Operational: menyiapkan peminjaman yang disetujui, menerima peringatan jatuh tempo, dan mengelola unit. */
export const operationalUsersSchema = z.object({
  userIds: z.array(z.string().min(1)).max(50, { error: "Maksimal 50 user" }),
});
export type OperationalUsersInput = z.infer<typeof operationalUsersSchema>;
