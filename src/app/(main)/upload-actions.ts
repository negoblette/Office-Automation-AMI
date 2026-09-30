"use server";

import { requireUser } from "@/lib/auth/guards";
import { type SaveUploadResult, saveUpload } from "@/lib/storage";

/**
 * Upload satu file (dipakai komponen `FileUpload`). File baru "terpakai" setelah key-nya
 * disimpan oleh form modul (Document, kwitansi, invoice); akses unduh tetap dicek
 * lewat pemilik data tersebut.
 */
export async function uploadFileAction(formData: FormData): Promise<SaveUploadResult> {
  await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "File tidak ditemukan" };
  return saveUpload(file);
}
