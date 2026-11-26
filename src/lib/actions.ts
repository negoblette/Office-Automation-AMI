// Hasil Server Action yang seragam untuk form: error umum dan/atau error per field.
import { z } from "zod";
import { ServiceError } from "@/lib/services/errors";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Ubah error dari validasi Zod / ServiceError menjadi ActionResult. Error lain
 * (termasuk redirect Next.js) dilempar ulang.
 */
export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, error: "Periksa kembali isian yang ditandai.", fieldErrors };
  }
  if (error instanceof ServiceError) {
    return {
      ok: false,
      error: error.message,
      fieldErrors: error.field ? { [error.field]: error.message } : undefined,
    };
  }
  // Prisma P2034 = transaksi bertabrakan / deadlock — PostgreSQL membatalkan salah satu, datanya utuh (rollback). Jaring
  // pengaman (audit keamanan 2026-11-26): pesan yang bisa dipahami, bukan halaman error. Dicek lewat `code`, bukan
  // instanceof, supaya file ini tidak mengimpor Prisma (tipenya juga dipakai komponen client).
  if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2034") {
    return { ok: false, error: "Data ini sedang diproses orang lain pada saat yang sama. Muat ulang halaman, lalu coba lagi." };
  }
  throw error;
}
