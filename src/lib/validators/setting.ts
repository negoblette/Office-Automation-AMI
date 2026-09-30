import { z } from "zod";
import { ApprovalModule, Division, Role } from "@/generated/prisma/enums";
import { optionalField, passwordSchema } from "./common";

/** Setting → User & Role. */
export const userRoleSchema = z.object({ role: z.enum(Role, { error: "Role wajib dipilih" }) });
export const resetPasswordSchema = z.object({ password: passwordSchema });

const stepsSchema = z
  .array(z.object({ approverIds: z.array(z.string().min(1)).min(1, { error: "Pilih minimal satu approver" }) }))
  .max(5, { error: "Maksimal 5 level approval" });

/**
 * Approval flow (SET-02): modul + divisi (kosong = semua divisi) + step berurutan.
 * Satu step boleh berisi beberapa approver (salah satu cukup). `noApproval` = tanpa approval
 * (step kosong, pengajuan langsung disetujui). `autoApproveWhenSkipped` = bila semua level
 * terlewati (pemohon adalah approver-nya sendiri) langsung disetujui, bukan ke Fallback.
 */
export const approvalFlowSchema = z
  .object({
    module: z.enum(ApprovalModule, { error: "Modul wajib dipilih" }),
    division: optionalField(z.enum(Division)),
    noApproval: z.boolean().default(false),
    autoApproveWhenSkipped: z.boolean().default(false),
    steps: stepsSchema,
  })
  .superRefine((v, ctx) => {
    if (!v.noApproval && v.steps.length === 0) ctx.addIssue({ code: "custom", path: ["steps"], message: "Minimal satu level approval" });
  })
  .transform((v) => ({ ...v, steps: v.noApproval ? [] : v.steps }));
export type ApprovalFlowInput = z.output<typeof approvalFlowSchema>;

/** Flow FALLBACK hanya punya step (tanpa modul & divisi), minimal satu level. */
export const fallbackFlowSchema = z.object({ steps: stepsSchema.min(1, { error: "Minimal satu level approval" }) });
