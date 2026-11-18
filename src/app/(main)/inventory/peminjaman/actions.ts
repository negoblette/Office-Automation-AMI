"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { inventoryEnabled } from "@/lib/features";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { cancelDemoLoan, markDemoLoanDelivered, returnDemoLoan, reviseDemoLoan, setItemSender, submitDemoLoan } from "@/lib/services/demo-loan";
import { cancelLoanExtension, requestLoanExtension } from "@/lib/services/demo-loan-extension";
import { deliverDemoLoanSchema, demoLoanExtensionSchema, demoLoanSchema, itemSenderSchema, returnDemoLoanSchema } from "@/lib/validators/demo-loan";

// Peminjaman unit demo (Fase 16, Tahap 16.2). Persetujuan lewat Approval Center (approval engine, modul DEMO_LOAN);
// hak akses dicek ulang di service. Email di-enqueue SETELAH transaksi commit.

async function run<T>(action: (user: Awaited<ReturnType<typeof requireUser>>) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  if (!inventoryEnabled(user)) return { ok: false, error: "Modul Inventaris sedang ditunda." };
  try {
    const data = await action(user);
    // Daftar, detail, lonceng, badge Approval & dashboard ikut berubah.
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}

const id = (value: string) => z.string().min(1).max(64).parse(value);

export async function submitDemoLoanAction(values: unknown): Promise<ActionResult<{ loanId: string }>> {
  return run(async (user) => {
    const result = await submitDemoLoan(prisma, user, demoLoanSchema.parse(values));
    await enqueueApprovalNotifications(prisma, result.notifications);
    return { loanId: result.loanId };
  });
}

/** Ubah pengajuan yang belum disetujui; yang ditolak otomatis diajukan ulang (approval dari level 1). */
export async function reviseDemoLoanAction(loanId: string, values: unknown): Promise<ActionResult<{ loanId: string; resubmitted: boolean }>> {
  return run(async (user) => {
    const result = await reviseDemoLoan(prisma, user, id(loanId), demoLoanSchema.parse(values));
    await enqueueApprovalNotifications(prisma, result.notifications);
    return { loanId: result.loanId, resubmitted: result.resubmitted };
  });
}

export async function cancelDemoLoanAction(loanId: string): Promise<ActionResult> {
  return run(async (user) => {
    await cancelDemoLoan(prisma, user, id(loanId));
    return undefined;
  });
}

/** Operational / Admin: barang sudah diantar → status Dipinjam (Tahap 16.3). */
export async function markDeliveredAction(loanId: string, values: unknown): Promise<ActionResult> {
  return run(async (user) => {
    await markDemoLoanDelivered(prisma, user, id(loanId), deliverDemoLoanSchema.parse(values));
    return undefined;
  });
}

/** Operational / Admin: barang kembali & sudah dicek → status Selesai, nomor HAF terbit (Tahap 16.5). */
export async function returnDemoLoanAction(loanId: string, values: unknown): Promise<ActionResult<{ loanId: string }>> {
  return run(async (user) => {
    const loan = await returnDemoLoan(prisma, user, id(loanId), returnDemoLoanSchema.parse(values));
    return { loanId: loan.id };
  });
}

/**
 * Ajukan perpanjangan jatuh tempo (Tahap 16.4): pemohon peminjaman / Operational / Admin, selama barang masih dipinjam.
 * Email approval ke approver (dan email "diperpanjang" ke Operational bila langsung disetujui) setelah commit.
 */
export async function requestLoanExtensionAction(loanId: string, values: unknown): Promise<ActionResult<{ approved: boolean }>> {
  return run(async (user) => {
    const result = await requestLoanExtension(prisma, user, id(loanId), demoLoanExtensionSchema.parse(values));
    await enqueueApprovalNotifications(prisma, result.notifications);
    return { approved: result.status === "APPROVED" };
  });
}

/** Batalkan perpanjangan yang belum diputuskan (hanya yang mengajukan). */
export async function cancelLoanExtensionAction(extensionId: string): Promise<ActionResult> {
  return run(async (user) => {
    await cancelLoanExtension(prisma, user, id(extensionId));
    return undefined;
  });
}

/** Operational / Admin: pilih pengantar barang (Item Sender) untuk peminjaman yang sudah disetujui. */
export async function setItemSenderAction(loanId: string, values: unknown): Promise<ActionResult> {
  return run(async (user) => {
    await setItemSender(prisma, user, id(loanId), itemSenderSchema.parse(values));
    return undefined;
  });
}
