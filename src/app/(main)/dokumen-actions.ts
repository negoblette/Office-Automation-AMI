"use server";

// Aksi dokumen & keluarga — dipakai halaman Admin (/karyawan/[id]) dan Profil Saya (/profil).
// Hak akses (Admin atau karyawan pemilik) dicek di service.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import {
  addDocument,
  addFamilyMember,
  deleteDocument,
  deleteFamilyMember,
  updateFamilyMember,
} from "@/lib/services/document";
import { ServiceError } from "@/lib/services/errors";
import { inspectStoredFile } from "@/lib/storage";
import { addDocumentSchema, familyMemberSchema } from "@/lib/validators/family";

function revalidateDocuments() {
  revalidatePath("/karyawan", "layout");
  revalidatePath("/profil", "layout");
}

/** Hapus file dari storage setelah data di DB terhapus (gagal hapus file tidak membatalkan aksi). */

/** Tautkan file yang sudah di-upload (FileUpload) sebagai dokumen karyawan/keluarga. */
export async function addDocumentAction(values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const input = addDocumentSchema.parse(values);
    // Ukuran & jenis diambil dari file asli, bukan dari data yang dikirim browser.
    const file = await inspectStoredFile(input.fileKey);
    if (!file) throw new ServiceError("File tidak ditemukan, silakan upload ulang");

    await addDocument(prisma, user, { ...input, ...file });
    revalidateDocuments();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteDocumentAction(documentId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    // Soft delete: data & file tetap disimpan (NFR v1.14).
    await deleteDocument(prisma, user, z.string().min(1).parse(documentId));
    revalidateDocuments();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addFamilyMemberAction(employeeId: string, values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await addFamilyMember(prisma, user, employeeId, familyMemberSchema.parse(values));
    revalidateDocuments();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateFamilyMemberAction(memberId: string, values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await updateFamilyMember(prisma, user, memberId, familyMemberSchema.parse(values));
    revalidateDocuments();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteFamilyMemberAction(memberId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await deleteFamilyMember(prisma, user, memberId);
    revalidateDocuments();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
