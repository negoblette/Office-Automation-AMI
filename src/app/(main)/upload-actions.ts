"use server";

import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { registerUpload, uploadQuotaError } from "@/lib/services/upload";
import { type SaveUploadResult, saveUpload } from "@/lib/storage";

/**
 * Upload satu file (dipakai komponen `FileUpload`). File baru "terpakai" setelah key-nya
 * disimpan oleh form modul (Document, kwitansi, invoice); akses unduh tetap dicek
 * lewat pemilik data tersebut. Hardening Tahap 7: kuota per orang, dan pengunggah dicatat — hanya dia yang boleh
 * menautkan file ini ke data (`assertFileKeyAvailable`).
 */
export async function uploadFileAction(formData: FormData): Promise<SaveUploadResult> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "File tidak ditemukan" };
  const quotaError = await uploadQuotaError(prisma, user.id, file.size);
  if (quotaError) return { ok: false, error: quotaError };
  const result = await saveUpload(file);
  if (result.ok) await registerUpload(prisma, user.id, result.file.key, result.file.sizeBytes);
  return result;
}
