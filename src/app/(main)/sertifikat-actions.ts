"use server";

// Aksi sertifikat — dipakai /karyawan/[id] (Admin) dan /profil/sertifikat (staf). Hak akses dicek di service.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { addCertificate, deleteCertificate, updateCertificate } from "@/lib/services/certificate";
import { ServiceError } from "@/lib/services/errors";
import { inspectStoredFile } from "@/lib/storage";
import { type CertificateInput, certificateSchema } from "@/lib/validators/certificate";

function revalidateCertificates() {
  revalidatePath("/karyawan", "layout");
  revalidatePath("/profil", "layout");
}

async function parseInput(values: unknown): Promise<CertificateInput> {
  const input = certificateSchema.parse(values);
  if (input.fileKey && !(await inspectStoredFile(input.fileKey))) {
    throw new ServiceError("File tidak ditemukan, silakan upload ulang", "fileKey");
  }
  return input;
}


export async function addCertificateAction(employeeId: string, values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const certificate = await addCertificate(prisma, user, z.string().min(1).parse(employeeId), await parseInput(values));
    // Email ke verifikator di-enqueue setelah transaksi commit.
    await enqueueApprovalNotifications(prisma, certificate.notifications);
    revalidateCertificates();
    revalidatePath("/approval");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateCertificateAction(certificateId: string, values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    // File lama yang diganti tetap disimpan (NFR v1.14).
    await updateCertificate(prisma, user, certificateId, await parseInput(values));
    revalidateCertificates();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteCertificateAction(certificateId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await deleteCertificate(prisma, user, certificateId);
    revalidateCertificates();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
