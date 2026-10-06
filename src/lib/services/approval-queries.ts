// Query halaman Approval (/approval) & badge sidebar. Hasil aman dikirim ke Client Component.
import type { ApprovalModule, Prisma, PrismaClient, RequestStatus } from "@/generated/prisma/client";
import type { ApprovalStepView } from "@/components/shared/approval-stepper";
import { CORRECTABLE_MODULES, type CorrectionView, listCorrections } from "./approval-correction";
import { formatDate } from "@/lib/format";
import { canRevoke } from "./approval";
import { appealSummary } from "./attendance-appeal";

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
  /** User yang login boleh membatalkan persetujuan terakhir (approver yang menyetujui / Admin). */
  canRevoke: boolean;
  /** Bisa dikoreksi approver (modul dengan nominal/keterangan). */
  correctable: boolean;
  /** Riwayat koreksi approver (Fase 14). */
  corrections: CorrectionView[];
  /** Ringkasan isi pengajuan untuk approver (mis. sertifikat yang diverifikasi). */
  summary: string | null;
  /** File pendukung (mis. scan sertifikat) — approver boleh mengunduhnya. */
  file: { key: string; name: string } | null;
};

const include = {
  requester: { select: { email: true, employee: { select: { fullName: true, position: true } } } },
  steps: { orderBy: { level: "asc" as const } },
} satisfies Prisma.ApprovalRequestInclude;

type RequestWithSteps = Prisma.ApprovalRequestGetPayload<{ include: typeof include }>;

async function toRows(db: PrismaClient, requests: RequestWithSteps[], viewerId: string): Promise<ApprovalRow[]> {
  const viewer = await db.user.findUnique({ where: { id: viewerId }, select: { id: true, role: true } });
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
  const correctionsOf = await listCorrections(db, requests.map((r) => r.id));
  const certIds = requests.filter((r) => r.module === "CERTIFICATE").map((r) => r.entityId);
  const certificates = certIds.length
    ? await db.certificate.findMany({ where: { id: { in: certIds } }, include: { employee: { select: { fullName: true } } } })
    : [];
  const certOf = new Map(certificates.map((c) => [c.id, c]));
  const appealIds = requests.filter((r) => r.module === "ATTENDANCE_APPEAL").map((r) => r.entityId);
  const appeals = appealIds.length
    ? await db.attendanceAppeal.findMany({ where: { id: { in: appealIds } }, include: { employee: { select: { fullName: true } } } })
    : [];
  const appealOf = new Map(appeals.map((a) => [a.id, a]));

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
    canRevoke: viewer ? canRevoke(viewer, request) : false,
    requestedAmount: request.module === "HEALTH" ? (claimAmountOf.get(request.entityId) ?? null) : null,
    correctable: (CORRECTABLE_MODULES as readonly ApprovalModule[]).includes(request.module),
    corrections: correctionsOf.get(request.id) ?? [],
    ...(() => {
      const appeal = appealOf.get(request.entityId);
      if (request.module === "ATTENDANCE_APPEAL" && appeal) return { summary: appealSummary(appeal), file: null };
      const c = certOf.get(request.entityId);
      if (request.module !== "CERTIFICATE" || !c) return { summary: null, file: null };
      const parts = [
        `${c.name} (${c.employee.fullName})`,
        c.issuer && `Penerbit ${c.issuer}`,
        c.number && `No. ${c.number}`,
        `Diambil ${formatDate(c.startDate, "short")}`,
        c.endDate ? `Berlaku s/d ${formatDate(c.endDate, "short")}` : "Tanpa masa berlaku",
      ];
      return { summary: parts.filter(Boolean).join(" · "), file: c.fileKey ? { key: c.fileKey, name: c.name } : null };
    })(),
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

/**
 * Monitor pengajuan (terbaru dulu). Admin: semua; Approver (`onlyInvolving`): hanya pengajuan yang
 * mencantumkan dia sebagai approver di salah satu level.
 */
export async function listAllApprovals(db: PrismaClient, viewerId: string, limit = 500, onlyInvolving = false): Promise<ApprovalRow[]> {
  const requests = await db.approvalRequest.findMany({
    where: onlyInvolving ? { steps: { some: { approverIds: { has: viewerId } } } } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include,
  });
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
