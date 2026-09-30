"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { addCandidateDocument, convertCandidate, deleteCandidate, deleteCandidateDocument, saveCandidate } from "@/lib/services/candidate";
import { ServiceError } from "@/lib/services/errors";
import { inspectStoredFile } from "@/lib/storage";
import { candidateSchema, convertCandidateSchema } from "@/lib/validators/candidate";
import { addDocumentSchema } from "@/lib/validators/family";

const id = z.string().min(1);

function revalidateCandidates() {
  revalidatePath("/kandidat", "layout");
  revalidatePath("/karyawan", "layout");
}


export async function saveCandidateAction(candidateId: string | null, values: unknown): Promise<ActionResult<{ candidateId: string }>> {
  const admin = await requireAdmin();
  try {
    const saved = await saveCandidate(prisma, admin.id, z.string().min(1).nullable().parse(candidateId), candidateSchema.parse(values));
    revalidateCandidates();
    return { ok: true, data: { candidateId: saved.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteCandidateAction(candidateId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await deleteCandidate(prisma, admin.id, id.parse(candidateId));
    revalidateCandidates();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Tautkan file yang sudah di-upload sebagai dokumen kandidat (CAN-01). */
export async function addCandidateDocumentAction(candidateId: string, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const input = addDocumentSchema.pick({ docType: true, fileKey: true, fileName: true }).parse(values);
    const file = await inspectStoredFile(input.fileKey);
    if (!file) throw new ServiceError("File tidak ditemukan, silakan upload ulang");
    await addCandidateDocument(prisma, admin.id, { candidateId: id.parse(candidateId), ...input, ...file });
    revalidateCandidates();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteCandidateDocumentAction(documentId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await deleteCandidateDocument(prisma, admin.id, id.parse(documentId));
    revalidateCandidates();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Jadikan karyawan (CAN-03): data & dokumen dipindahkan tanpa input ulang. */
export async function convertCandidateAction(candidateId: string, values: unknown): Promise<ActionResult<{ employeeId: string }>> {
  const admin = await requireAdmin();
  try {
    const result = await convertCandidate(prisma, admin.id, id.parse(candidateId), convertCandidateSchema.parse(values));
    revalidateCandidates();
    return { ok: true, data: { employeeId: result.employeeId } };
  } catch (error) {
    return toActionError(error);
  }
}
