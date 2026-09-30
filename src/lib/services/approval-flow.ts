// Setting → Approval Flow (SET-02, Tahap 10.3). Pengajuan yang sudah berjalan tidak terpengaruh
// karena approver di-snapshot ke ApprovalRequestStep saat submit (Tech Spec §4.1).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ApprovalFlowInput } from "@/lib/validators/setting";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { flowLabel } from "./user-admin";

type Tx = Prisma.TransactionClient;

const flowInclude = {
  steps: { orderBy: { level: "asc" as const }, include: { approvers: { include: { user: { select: { id: true, email: true, isActive: true, role: true, employee: { select: { fullName: true } } } } } } } },
} satisfies Prisma.ApprovalFlowInclude;

export type FlowView = {
  id: string;
  label: string;
  module: ApprovalFlowInput["module"] | null;
  division: ApprovalFlowInput["division"];
  scope: "REGULAR" | "FALLBACK";
  isActive: boolean;
  autoApproveWhenSkipped: boolean;
  steps: { level: number; approvers: { id: string; name: string; usable: boolean }[] }[];
};

export async function listFlows(db: PrismaClient): Promise<FlowView[]> {
  const flows = await db.approvalFlow.findMany({ where: { deletedAt: null }, include: flowInclude, orderBy: [{ scope: "asc" }, { module: "asc" }, { division: "asc" }] });
  return flows.map((flow) => ({
    id: flow.id,
    label: flowLabel(flow),
    module: flow.module,
    division: flow.division,
    scope: flow.scope,
    isActive: flow.isActive,
    autoApproveWhenSkipped: flow.autoApproveWhenSkipped,
    steps: flow.steps.map((step) => ({
      level: step.level,
      approvers: step.approvers.map((a) => ({
        id: a.user.id,
        name: a.user.employee?.fullName ?? a.user.email,
        usable: a.user.isActive && a.user.role === "ADMIN",
      })),
    })),
  }));
}

/** Approver yang bisa dipilih: Admin aktif (approver selalu Admin, Tech Spec §4.2). */
export async function listApproverOptions(db: PrismaClient) {
  const admins = await db.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true, email: true, employee: { select: { fullName: true } } },
    orderBy: { email: "asc" },
  });
  return admins.map((a) => ({ value: a.id, label: a.employee?.fullName ?? a.email }));
}

async function assertValidSteps(tx: Tx, steps: ApprovalFlowInput["steps"]) {
  const all = steps.flatMap((s) => s.approverIds);
  if (all.length === 0) return;
  if (new Set(all).size !== all.length) throw new ServiceError("Satu approver tidak boleh muncul di lebih dari satu level", "steps");
  const valid = await tx.user.count({ where: { id: { in: all }, role: "ADMIN", isActive: true } });
  if (valid !== all.length) throw new ServiceError("Approver harus Admin yang aktif", "steps");
}

async function assertNoDuplicateFlow(tx: Tx, module: ApprovalFlowInput["module"], division: ApprovalFlowInput["division"], exceptId?: string) {
  const duplicate = await tx.approvalFlow.findFirst({
    where: { scope: "REGULAR", isActive: true, deletedAt: null, module, division, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (duplicate) throw new ServiceError("Sudah ada flow aktif untuk modul & divisi ini", "division");
}

function stepsCreate(steps: ApprovalFlowInput["steps"]) {
  return steps.map((step, index) => ({ level: index + 1, approvers: { create: step.approverIds.map((userId) => ({ userId })) } }));
}

const summary = (input: { module?: unknown; division?: unknown; autoApproveWhenSkipped?: boolean; steps: ApprovalFlowInput["steps"] }) => ({
  module: input.module,
  division: input.division,
  autoApproveWhenSkipped: input.autoApproveWhenSkipped,
  steps: input.steps.map((s) => s.approverIds),
});

/** Buat flow REGULAR baru, atau ubah flow (REGULAR/FALLBACK) — step diganti seluruhnya. */
export async function saveFlow(
  db: PrismaClient,
  actorId: string,
  flowId: string | null,
  input: Pick<ApprovalFlowInput, "steps"> & Partial<Pick<ApprovalFlowInput, "module" | "division" | "autoApproveWhenSkipped">>,
) {
  return db.$transaction(async (tx) => {
    await assertValidSteps(tx, input.steps);
    if (!flowId) {
      if (!input.module) throw new ServiceError("Modul wajib dipilih", "module");
      const division = input.division ?? null;
      await assertNoDuplicateFlow(tx, input.module, division);
      const flow = await tx.approvalFlow.create({
        data: {
          module: input.module,
          division,
          scope: "REGULAR",
          autoApproveWhenSkipped: input.autoApproveWhenSkipped ?? false,
          steps: { create: stepsCreate(input.steps) },
        },
      });
      await logAudit(tx, { actorId, action: "CREATE", entity: "ApprovalFlow", entityId: flow.id, after: summary({ ...input, division }) });
      return flow;
    }

    const before = await tx.approvalFlow.findUnique({ where: { id: flowId }, include: { steps: { include: { approvers: true } } } });
    if (!before || before.deletedAt) throw new ServiceError("Approval flow tidak ditemukan");
    const isFallback = before.scope === "FALLBACK";
    if (isFallback && input.steps.length === 0) throw new ServiceError("Flow Fallback harus punya minimal satu level", "steps");
    const autoApproveWhenSkipped = isFallback ? false : (input.autoApproveWhenSkipped ?? before.autoApproveWhenSkipped);
    const flowModule = isFallback ? null : (input.module ?? before.module);
    const division = isFallback ? null : input.division === undefined ? before.division : input.division;
    if (!isFallback && before.isActive) await assertNoDuplicateFlow(tx, flowModule!, division, flowId);

    await tx.approvalFlowStep.deleteMany({ where: { flowId } });
    const flow = await tx.approvalFlow.update({
      where: { id: flowId },
      data: { module: flowModule, division, autoApproveWhenSkipped, steps: { create: stepsCreate(input.steps) } },
    });
    await logAudit(tx, {
      actorId,
      action: "UPDATE",
      entity: "ApprovalFlow",
      entityId: flowId,
      before: summary({
        module: before.module,
        division: before.division,
        autoApproveWhenSkipped: before.autoApproveWhenSkipped,
        steps: before.steps.map((s) => ({ approverIds: s.approvers.map((a) => a.userId) })),
      }),
      after: summary({ module: flowModule, division, autoApproveWhenSkipped, steps: input.steps }),
    });
    return flow;
  });
}

export async function setFlowActive(db: PrismaClient, actorId: string, flowId: string, isActive: boolean) {
  return db.$transaction(async (tx) => {
    const flow = await tx.approvalFlow.findUnique({ where: { id: flowId } });
    if (!flow || flow.deletedAt) throw new ServiceError("Approval flow tidak ditemukan");
    if (flow.scope === "FALLBACK") throw new ServiceError("Flow Fallback tidak bisa dinonaktifkan");
    if (flow.isActive === isActive) return;
    if (isActive) await assertNoDuplicateFlow(tx, flow.module!, flow.division, flowId);
    await tx.approvalFlow.update({ where: { id: flowId }, data: { isActive } });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "ApprovalFlow", entityId: flowId, before: { isActive: flow.isActive }, after: { isActive } });
  });
}

export async function deleteFlow(db: PrismaClient, actorId: string, flowId: string) {
  return db.$transaction(async (tx) => {
    const flow = await tx.approvalFlow.findUnique({ where: { id: flowId }, include: { steps: { include: { approvers: true } } } });
    if (!flow || flow.deletedAt) throw new ServiceError("Approval flow tidak ditemukan");
    if (flow.scope === "FALLBACK") throw new ServiceError("Flow Fallback tidak bisa dihapus");
    // Soft delete (NFR v1.14: data tidak dihapus permanen).
    await tx.approvalFlow.update({ where: { id: flowId }, data: { deletedAt: new Date(), isActive: false } });
    await logAudit(tx, {
      actorId,
      action: "DELETE",
      entity: "ApprovalFlow",
      entityId: flowId,
      before: summary({ module: flow.module, division: flow.division, steps: flow.steps.map((s) => ({ approverIds: s.approvers.map((a) => a.userId) })) }),
    });
  });
}
