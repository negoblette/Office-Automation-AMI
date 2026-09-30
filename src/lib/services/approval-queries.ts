// Query halaman Approval (/approval) & badge sidebar. Hasil aman dikirim ke Client Component.
import type { ApprovalModule, Prisma, PrismaClient, RequestStatus } from "@/generated/prisma/client";
import type { ApprovalStepView } from "@/components/shared/approval-stepper";

/** Jumlah pengajuan yang sedang menunggu persetujuan user ini (step PENDING). */
export function countPendingApprovals(db: PrismaClient, userId: string): Promise<number> {
  return db.approvalRequestStep.count({
    where: { status: "PENDING", approverIds: { has: userId }, request: { status: "PENDING" } },
  });
}

export type ApprovalRow = {
  id: string;
  module: ApprovalModule;
  entityId: string;
  entityNumber: string;
  status: RequestStatus;
  currentLevel: number | null;
  createdAt: string;
  completedAt: string | null;
  requesterName: string;
  requesterPosition: string | null;
  steps: ApprovalStepView[];
  /** true jika user yang login adalah approver step PENDING. */
  canApprove: boolean;
  /** HEALTH: nominal diajukan (dasar isian "nominal disetujui"); null untuk modul lain. */
  requestedAmount: number | null;
};

const include = {
  requester: { select: { email: true, employee: { select: { fullName: true, position: true } } } },
  steps: { orderBy: { level: "asc" as const } },
} satisfies Prisma.ApprovalRequestInclude;

type RequestWithSteps = Prisma.ApprovalRequestGetPayload<{ include: typeof include }>;

async function toRows(db: PrismaClient, requests: RequestWithSteps[], viewerId: string): Promise<ApprovalRow[]> {
  // Nama approver & pelaku untuk semua step sekaligus.
  const userIds = new Set(requests.flatMap((r) => r.steps.flatMap((s) => [...s.approverIds, ...(s.actedById ? [s.actedById] : [])])));
  const users = await db.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, email: true, employee: { select: { fullName: true } } },
  });
  const nameOf = new Map(users.map((user) => [user.id, user.employee?.fullName ?? user.email]));
  const healthIds = requests.filter((r) => r.module === "HEALTH").map((r) => r.entityId);
  const claims = healthIds.length
    ? await db.healthClaim.findMany({ where: { id: { in: healthIds } }, select: { id: true, amount: true } })
    : [];
  const claimAmountOf = new Map(claims.map((c) => [c.id, Number(c.amount)]));

  return requests.map((request) => ({
    id: request.id,
    module: request.module,
    entityId: request.entityId,
    entityNumber: request.entityNumber,
    status: request.status,
    currentLevel: request.currentLevel,
    createdAt: request.createdAt.toISOString(),
    completedAt: request.completedAt?.toISOString() ?? null,
    requesterName: request.requester.employee?.fullName ?? request.requester.email,
    requesterPosition: request.requester.employee?.position ?? null,
    steps: request.steps.map((step) => ({
      level: step.level,
      approvers: step.approverIds.map((id) => nameOf.get(id) ?? "—"),
      status: step.status,
      actedBy: step.actedById ? (nameOf.get(step.actedById) ?? null) : null,
      actedAt: step.actedAt?.toISOString() ?? null,
    })),
    canApprove: request.steps.some((step) => step.status === "PENDING" && step.approverIds.includes(viewerId)),
    requestedAmount: request.module === "HEALTH" ? (claimAmountOf.get(request.entityId) ?? null) : null,
  }));
}

/** Antrian milik Admin yang login: pengajuan dengan step PENDING yang mencantumkan dia. */
export async function listMyApprovalQueue(db: PrismaClient, userId: string): Promise<ApprovalRow[]> {
  const requests = await db.approvalRequest.findMany({
    where: { status: "PENDING", steps: { some: { status: "PENDING", approverIds: { has: userId } } } },
    orderBy: { createdAt: "asc" },
    include,
  });
  return toRows(db, requests, userId);
}

/** Monitor semua pengajuan (terbaru dulu). */
export async function listAllApprovals(db: PrismaClient, viewerId: string, limit = 500): Promise<ApprovalRow[]> {
  const requests = await db.approvalRequest.findMany({ orderBy: { createdAt: "desc" }, take: limit, include });
  return toRows(db, requests, viewerId);
}

/** Pengajuan milik user (terbaru dulu) — dashboard Staf. */
export async function listMyRequests(db: PrismaClient, userId: string, limit = 8): Promise<ApprovalRow[]> {
  const requests = await db.approvalRequest.findMany({
    where: { requesterId: userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include,
  });
  return toRows(db, requests, userId);
}
