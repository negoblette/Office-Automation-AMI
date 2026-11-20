// Masukan peminjaman unit demo / Product Trial Form (Fase 16, 2026-11-17).
import { z } from "zod";
import { LoanPurpose, ReturnCondition } from "@/generated/prisma/enums";
import { MAX_LOAN_ITEMS, maxLoanEnd } from "@/lib/demo-loan";
import { RACK_POSITION } from "@/lib/inventory";
import { emailSchema, isoDateSchema, optionalField, textSchema } from "./common";

const requiredId = (message: string) => z.string({ error: message }).min(1, { error: message });

/**
 * Form pengajuan (Engineer / Sales): kegunaan (Backup Unit / POC), unit, peminjam (nama Customer atau diketik), kontak
 * peminjam + email, PIC dari AMI (Engineer / Sales, 2026-11-19 — dulu Sales Person), tanggal mulai & tanggal selesai
 * (lamanya dihitung), keperluan. Ketersediaan & pemilik unit serta PIC dicek di service.
 */
export const demoLoanSchema = z
  .object({
    purpose: z.enum(LoanPurpose, { error: "Pilih kegunaan peminjaman" }),
    /** Wajib bila kegunaan "Lainnya" (2026-11-17); diabaikan untuk Backup Unit / POC. */
    purposeDetail: optionalField(textSchema("Detail kegunaan", { min: 3, max: 200 })),
    assetIds: z
      .array(z.string().min(1))
      .min(1, { error: "Pilih minimal 1 unit" })
      .max(MAX_LOAN_ITEMS, { error: `Maksimal ${MAX_LOAN_ITEMS} unit dalam satu form` })
      .refine((ids) => new Set(ids).size === ids.length, { error: "Ada unit yang terpilih dua kali" }),
    borrowerName: textSchema("Perusahaan peminjam", { min: 2, max: 150 }),
    contactName: textSchema("Nama kontak peminjam", { min: 2, max: 100 }),
    contactEmail: emailSchema,
    picId: requiredId("PIC wajib dipilih"),
    startDate: isoDateSchema,
    /** Tanggal selesai = hari terakhir pinjam (inklusif) = jatuh tempo; lamanya dihitung dari kedua tanggal. */
    dueDate: isoDateSchema,
    remarks: optionalField(textSchema("Keperluan", { max: 500 })),
  })
  .superRefine((data, ctx) => {
    if (data.purpose === "OTHER" && !data.purposeDetail) {
      ctx.addIssue({ code: "custom", path: ["purposeDetail"], message: "Tulis detail kegunaannya" });
    }
    if (data.dueDate < data.startDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Tanggal selesai tidak boleh sebelum tanggal mulai" });
    } else if (data.dueDate > maxLoanEnd(data.startDate)) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Jangka pinjam maksimal 2 tahun" });
    }
  });
export type DemoLoanInput = z.infer<typeof demoLoanSchema>;

/** Operational menyiapkan barang: pilih pengantar (Item Sender). */
export const itemSenderSchema = z.object({
  itemSenderId: requiredId("Item Sender wajib dipilih"),
});
export type ItemSenderInput = z.infer<typeof itemSenderSchema>;

/** Operational menandai barang sudah diantar: tanggal (tidak di masa depan, dicek service) & nama penerima (opsional). */
export const deliverDemoLoanSchema = z.object({
  deliveredAt: isoDateSchema,
  receivedByName: optionalField(textSchema("Nama penerima", { min: 2, max: 100 })),
});
export type DeliverDemoLoanInput = z.infer<typeof deliverDemoLoanSchema>;

/**
 * Jadwalkan pengambilan (2026-11-19, Operational): tanggal pengambilan ("Date" di HAF) & kurir AMI ("Received By").
 * Batas tanggal (tidak sebelum tanggal diantar, maks. 90 hari ke depan) dicek service — butuh data peminjaman.
 */
export const loanPickupSchema = z.object({
  pickupDate: isoDateSchema,
  courierId: requiredId("Kurir wajib dipilih"),
});
export type LoanPickupInput = z.infer<typeof loanPickupSchema>;

/**
 * Pengecekan Unit (Tahap 16.5; sejak 2026-11-19 setelah barang diambil kurir & tiba di AMI, kembali sepenuhnya): tanggal
 * tiba, yang menyerahkan di peminjam (opsional, sesuai HAF), catatan umum, dan hasil cek setiap unit (kondisi wajib,
 * catatan, posisi rak tempat ditaruh — rak & posisi berpasangan). Semua unit wajib dicek (dicocokkan di service).
 */
export const returnDemoLoanSchema = z.object({
  returnedAt: isoDateSchema,
  returnedByName: optionalField(textSchema("Nama yang menyerahkan", { min: 2, max: 100 })),
  note: optionalField(textSchema("Catatan", { max: 500 })),
  items: z
    .array(
      z
        .object({
          itemId: z.string().min(1),
          condition: z.enum(ReturnCondition, { error: "Pilih kondisi unit" }),
          note: optionalField(textSchema("Catatan unit", { max: 300 })),
          rackId: optionalField(z.string().min(1)),
          rackPosition: optionalField(z.string().trim().toUpperCase().regex(RACK_POSITION, { error: "Posisi tidak valid (contoh: A1)" })),
        })
        .superRefine((item, ctx) => {
          if (item.rackId && !item.rackPosition) ctx.addIssue({ code: "custom", path: ["rackPosition"], message: "Posisi di rak wajib dipilih" });
          if (item.rackPosition && !item.rackId) ctx.addIssue({ code: "custom", path: ["rackId"], message: "Rak wajib dipilih" });
          if (item.condition !== "GOOD" && !item.note) ctx.addIssue({ code: "custom", path: ["note"], message: "Tulis kerusakan / kekurangannya" });
        }),
    )
    .min(1, { error: "Belum ada unit yang dicek" }),
});
export type ReturnDemoLoanInput = z.infer<typeof returnDemoLoanSchema>;

/**
 * Selesaikan tindak lanjut (2026-11-20, Operational): hasil tiap unit bermasalah (sudah lengkap / diperbaiki, atau tetap
 * rusak / tidak lengkap) + catatan penyelesaian wajib. Unit dicocokkan dengan unit bermasalah peminjaman di service.
 */
export const resolveFollowUpSchema = z.object({
  note: textSchema("Catatan tindak lanjut", { min: 5, max: 500 }),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        result: z.enum(["RESOLVED", "UNRESOLVED"], { error: "Pilih hasil tindak lanjut" }),
      }),
    )
    .min(1, { error: "Belum ada unit yang diisi hasilnya" }),
});
export type ResolveFollowUpInput = z.infer<typeof resolveFollowUpSchema>;

/**
 * Ajukan perpanjangan jatuh tempo (Tahap 16.4): tanggal selesai baru (hari terakhir pinjam) + alasan. Batas tanggal
 * (setelah jatuh tempo sekarang, tidak sebelum hari ini, maks. 2 tahun sejak mulai) dicek service — butuh data peminjaman.
 */
export const demoLoanExtensionSchema = z.object({
  newDueDate: isoDateSchema,
  reason: textSchema("Alasan perpanjangan", { min: 5, max: 500 }),
});
export type DemoLoanExtensionInput = z.infer<typeof demoLoanExtensionSchema>;

/** Setting (Admin): nomor terakhir Product Trial Form tahun ini — nomor berikutnya = nilai ini + 1. */
export const trialFormCounterSchema = z.object({
  lastNumber: z.coerce
    .number({ error: "Nomor wajib angka" })
    .int({ error: "Nomor harus bilangan bulat" })
    .min(0, { error: "Nomor minimal 0" })
    .max(9999, { error: "Nomor maksimal 9999" }),
});
export type TrialFormCounterInput = z.infer<typeof trialFormCounterSchema>;
