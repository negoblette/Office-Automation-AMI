// Approval engine — Tech Spec §4, URD §2.2. Dipakai Reimburse, Cuti, Kesehatan, Expense, Revenue.
//
// - build(): dipanggil di dalam transaksi SUBMIT modul; membuat snapshot ApprovalRequest + steps.
// - approve(): dipanggil dari halaman Approval; memajukan step atau menyelesaikan pengajuan.
// Keduanya mengembalikan `notifications` yang di-enqueue pemanggil SETELAH commit (Tahap 5.4).
import type { ApprovalModule, Prisma, PrismaClient } from "@/generated/prisma/client";
import { FINAL_EFFECTS, type FinalEffectOptions, REVERT_EFFECTS } from "./approval-effects";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { canApprove } from "@/lib/roles";

type Tx = Prisma.TransactionClient;

/** Ditolak karena bukan approver yang berhak (HTTP 403 secara konsep). */
export class ForbiddenError extends ServiceError {
  constructor(message = "Anda tidak berhak menyetujui pengajuan ini") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type ApprovalTemplate = "approval-requested" | "approval-progress" | "approval-final";

/** Email yang harus dikirim setelah transaksi commit. */
export type ApprovalNotification = {
  template: ApprovalTemplate;
  /** User id penerima. */
  recipientIds: string[];
  requestId: string;
};

async function runFinalEffect(tx: Tx, module: ApprovalModule, entityId: string, approvedAt: Date, options: FinalEffectOptions = {}) {
  await FINAL_EFFECTS[module]?.(tx, entityId, approvedAt, options);
}

async function adminIds(tx: Tx) {
  const admins = await tx.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
  return admins.map((admin) => admin.id);
}

// ---------------------------------------------------------------------
// build (Tech Spec §4.1)
// ---------------------------------------------------------------------

type FlowWithSteps = Prisma.ApprovalFlowGetPayload<{
  include: { steps: { include: { approvers: { include: { user: { select: { id: true; isActive: true; role: true } } } } } } };
}>;

const flowInclude = {
  steps: {
    orderBy: { level: "asc" as const },
    include: { approvers: { include: { user: { select: { id: true, isActive: true, role: true } } } } },
  },
};

type PlannedStep = { approverIds: string[]; skipped: boolean };

function planSteps(flow: FlowWithSteps, requesterId: string): PlannedStep[] {
  return flow.steps.map((step) => {
    const approverIds = step.approvers.filter((a) => a.user.isActive && canApprove(a.user.role)).map((a) => a.userId);
    if (approverIds.length === 0) {
      throw new ServiceError(`Approver level ${step.level} tidak aktif. Perbarui Approval Flow di Setting.`);
    }
    // Pemohon tidak menyetujui pengajuannya sendiri: dikeluarkan dari level itu (keputusan user
    // 2026-10-02: Darwin → Leonard, Ika → Leonard). Level tanpa approver lain → dilewati.
    const others = approverIds.filter((id) => id !== requesterId);
    return others.length > 0 ? { approverIds: others, skipped: false } : { approverIds, skipped: true };
  });
}

export type BuildApprovalInput = {
  module: ApprovalModule;
  entityId: string;
  entityNumber: string;
  requesterId: string;
};

export type BuildApprovalResult = {
  requestId: string;
  status: "PENDING" | "APPROVED";
  notifications: ApprovalNotification[];
};

export async function buildApproval(tx: Tx, input: BuildApprovalInput): Promise<BuildApprovalResult> {
  const requester = await tx.user.findUnique({
    where: { id: input.requesterId },
    select: { id: true, employee: { select: { division: true } } },
  });
  if (!requester?.employee) throw new ServiceError("Pemohon tidak memiliki data karyawan");
  const division = requester.employee.division;

  const base = {
    module: input.module,
    entityId: input.entityId,
    entityNumber: input.entityNumber,
    requesterId: input.requesterId,
  };

  /** Langsung APPROVED (flow tanpa level, atau semua level terlewati pada flow autoApproveWhenSkipped). */
  const autoApprove = async (skippedSteps: PlannedStep[] = []): Promise<BuildApprovalResult> => {
    const now = new Date();
    const request = await tx.approvalRequest.create({
      data: {
        ...base,
        status: "APPROVED",
        currentLevel: null,
        completedAt: now,
        steps: { create: skippedSteps.map((step, index) => ({ level: index + 1, approverIds: step.approverIds, status: "SKIPPED" as const })) },
      },
    });
    await runFinalEffect(tx, input.module, input.entityId, now);
    return {
      requestId: request.id,
      status: "APPROVED",
      notifications: [{ template: "approval-final", recipientIds: unique([input.requesterId, ...(await adminIds(tx))]), requestId: request.id }],
    };
  };

  // 1. Flow REGULAR sesuai modul + divisi pemohon; jika tidak ada, flow modul untuk semua divisi.
  const flows = await tx.approvalFlow.findMany({
    where: { scope: "REGULAR", module: input.module, isActive: true, deletedAt: null, OR: [{ division }, { division: null }] },
    include: flowInclude,
  });
  const flow = flows.find((f) => f.division === division) ?? flows.find((f) => f.division === null);
  if (!flow) throw new ServiceError("Alur approval untuk pengajuan ini belum diatur. Hubungi Admin.");

  // 2. Flow tanpa level = tanpa approval (mis. cuti divisi Direktur, v1.14 BR-CUT-11).
  if (flow.steps.length === 0) return autoApprove();

  // 3. Step yang mencakup pemohon -> SKIPPED. 4. Semua ter-skip -> otomatis disetujui (bila flow
  //    mengizinkan, mis. reimburse Bu Ika) atau tambahkan flow FALLBACK.
  const steps = planSteps(flow, input.requesterId);
  if (steps.every((step) => step.skipped)) {
    if (flow.autoApproveWhenSkipped) return autoApprove(steps);
    const fallback = await tx.approvalFlow.findFirst({ where: { scope: "FALLBACK", isActive: true, deletedAt: null }, include: flowInclude });
    if (!fallback) throw new ServiceError("Alur approval FALLBACK belum diatur. Hubungi Admin.");
    steps.push(...planSteps(fallback, input.requesterId));
    if (steps.every((step) => step.skipped)) {
      throw new ServiceError("Tidak ada approver lain untuk pengajuan ini. Hubungi Admin.");
    }
  }

  // Step aktif pertama -> PENDING, sisanya WAITING (5. berurutan).
  const firstActive = steps.findIndex((step) => !step.skipped);
  const request = await tx.approvalRequest.create({
    data: {
      ...base,
      status: "PENDING",
      currentLevel: firstActive + 1,
      steps: {
        create: steps.map((step, index) => ({
          level: index + 1,
          approverIds: step.approverIds,
          status: step.skipped ? "SKIPPED" : index === firstActive ? "PENDING" : "WAITING",
        })),
      },
    },
  });

  return {
    requestId: request.id,
    status: "PENDING",
    notifications: [{ template: "approval-requested", recipientIds: steps[firstActive].approverIds, requestId: request.id }],
  };
}

// ---------------------------------------------------------------------
// approve (Tech Spec §4.2)
// ---------------------------------------------------------------------

export type ApproveResult = {
  status: "PENDING" | "APPROVED";
  notifications: ApprovalNotification[];
};

export async function approveRequest(
  db: PrismaClient,
  input: {
    requestId: string;
    actorId: string;
    note?: string | null;
    /** Klaim kesehatan: nominal disetujui approver final (default = nominal diajukan). */
    approvedAmount?: number | null;
  },
): Promise<ApproveResult> {
  return db.$transaction(async (tx) => {
    const request = await tx.approvalRequest.findUnique({
      where: { id: input.requestId },
      include: { steps: { orderBy: { level: "asc" } } },
    });
    if (!request) throw new ServiceError("Pengajuan tidak ditemukan");
    if (request.status !== "PENDING") throw new ServiceError("Pengajuan ini sudah diproses");

    const current = request.steps.find((step) => step.status === "PENDING");
    if (!current) throw new ServiceError("Pengajuan ini sudah diproses");

    // 1. Validasi: user ADMIN aktif DAN termasuk approver step PENDING.
    const actor = await tx.user.findUnique({ where: { id: input.actorId }, select: { role: true, isActive: true } });
    if (!actor?.isActive || !canApprove(actor.role) || !current.approverIds.includes(input.actorId)) {
      throw new ForbiddenError();
    }

    // 2. Step → APPROVED. Update bersyarat: jika approver lain sudah lebih dulu, tidak ada yang berubah.
    const now = new Date();
    const updated = await tx.approvalRequestStep.updateMany({
      where: { id: current.id, status: "PENDING" },
      data: { status: "APPROVED", actedById: input.actorId, actedAt: now, note: input.note ?? null },
    });
    if (updated.count === 0) throw new ServiceError("Pengajuan ini sudah diproses approver lain");

    await logAudit(tx, {
      actorId: input.actorId,
      action: "APPROVE",
      entity: "ApprovalRequest",
      entityId: request.id,
      after: { module: request.module, entityNumber: request.entityNumber, level: current.level, note: input.note ?? null },
    });

    // 3. Ada step WAITING berikutnya → PENDING; email ke approver-nya + info ke pemohon.
    const next = request.steps.find((step) => step.level > current.level && step.status === "WAITING");
    if (next) {
      await tx.approvalRequestStep.update({ where: { id: next.id }, data: { status: "PENDING" } });
      await tx.approvalRequest.update({ where: { id: request.id }, data: { currentLevel: next.level } });
      return {
        status: "PENDING",
        notifications: [
          { template: "approval-requested", recipientIds: next.approverIds, requestId: request.id },
          { template: "approval-progress", recipientIds: [request.requesterId], requestId: request.id },
        ],
      };
    }

    // 4. Tidak ada → APPROVED final, efek modul, email ke pemohon + semua Admin.
    await tx.approvalRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", currentLevel: null, completedAt: now },
    });
    await runFinalEffect(tx, request.module, request.entityId, now, { approvedAmount: input.approvedAmount ?? null });
    return {
      status: "APPROVED",
      notifications: [
        { template: "approval-final", recipientIds: unique([request.requesterId, ...(await adminIds(tx))]), requestId: request.id },
      ],
    };
  });
}

// ---------------------------------------------------------------------
// revoke — batalkan persetujuan (2026-10-06, "ubah keputusan approval")
// ---------------------------------------------------------------------

type RequestWithSteps = Prisma.ApprovalRequestGetPayload<{ include: { steps: true } }>;

/**
 * Step yang persetujuannya bisa dibatalkan: step APPROVED terakhir yang disetujui orang (bukan
 * otomatis), dan belum ada keputusan sesudahnya. null = tidak ada.
 */
export function revocableStep(request: Pick<RequestWithSteps, "status" | "steps">) {
  if (request.status !== "PENDING" && request.status !== "APPROVED") return null;
  const steps = [...request.steps].sort((a, b) => a.level - b.level);
  const last = steps.filter((s) => s.status === "APPROVED").at(-1);
  if (!last?.actedById) return null;
  // Level setelahnya hanya boleh SKIPPED / PENDING (belum diputuskan) / WAITING.
  if (steps.some((s) => s.level > last.level && s.status === "APPROVED")) return null;
  return last;
}

/** Yang boleh membatalkan: approver yang menyetujui step itu, atau Admin — bukan pemohon sendiri. */
export function canRevoke(viewer: { id: string; role: string }, request: Pick<RequestWithSteps, "status" | "steps" | "requesterId" | "module">) {
  const step = revocableStep(request);
  if (!step || viewer.id === request.requesterId) return false;
  if (request.status === "APPROVED" && !REVERT_EFFECTS[request.module]) return false;
  return step.actedById === viewer.id || viewer.role === "ADMIN";
}

/**
 * Batalkan persetujuan terakhir: step itu kembali PENDING (bisa dikoreksi & disetujui ulang).
 * Jika pengajuan sudah final, efek modul dibatalkan (saldo cuti dikembalikan, payout klaim dihapus
 * bila belum dibayar, dst.). Tercatat di riwayat koreksi (terlihat pemohon) + audit.
 */
export async function revokeApproval(db: PrismaClient, input: { requestId: string; actorId: string; reason: string }): Promise<ApproveResult> {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new ServiceError("Alasan pembatalan minimal 3 karakter", "reason");
  return db.$transaction(async (tx) => {
    const request = await tx.approvalRequest.findUnique({ where: { id: input.requestId }, include: { steps: true } });
    if (!request) throw new ServiceError("Pengajuan tidak ditemukan");
    const actor = await tx.user.findUnique({
      where: { id: input.actorId },
      select: { id: true, role: true, isActive: true, email: true, employee: { select: { fullName: true } } },
    });
    if (!actor?.isActive || !canApprove(actor.role)) throw new ForbiddenError("Anda tidak berhak membatalkan persetujuan ini");
    const step = revocableStep(request);
    if (!step) throw new ServiceError("Tidak ada persetujuan yang bisa dibatalkan pada pengajuan ini");
    if (!canRevoke(actor, request)) {
      throw new ForbiddenError(
        actor.id === request.requesterId ? "Tidak bisa membatalkan persetujuan pengajuan sendiri" : "Hanya approver yang menyetujui atau Admin yang bisa membatalkan",
      );
    }

    const wasFinal = request.status === "APPROVED";
    if (wasFinal) await REVERT_EFFECTS[request.module]!(tx, request.entityId);

    // Step yang sedang menunggu (level berikutnya) kembali WAITING; step yang dibatalkan → PENDING.
    await tx.approvalRequestStep.updateMany({ where: { requestId: request.id, status: "PENDING" }, data: { status: "WAITING" } });
    const changed = await tx.approvalRequestStep.updateMany({
      where: { id: step.id, status: "APPROVED" },
      data: { status: "PENDING", actedById: null, actedAt: null, note: null },
    });
    if (changed.count === 0) throw new ServiceError("Pengajuan ini baru saja diubah — muat ulang halaman");
    await tx.approvalRequest.update({ where: { id: request.id }, data: { status: "PENDING", currentLevel: step.level, completedAt: null } });

    const approverName = await tx.user.findUnique({ where: { id: step.actedById! }, select: { email: true, employee: { select: { fullName: true } } } });
    await tx.approvalCorrection.create({
      data: {
        requestId: request.id,
        level: step.level,
        targetId: step.id,
        label: `Persetujuan level ${step.level}`,
        field: "REVOKE",
        before: `Disetujui ${approverName?.employee?.fullName ?? approverName?.email ?? ""}`.trim(),
        after: `Dibatalkan: ${reason}`,
        editedById: actor.id,
      },
    });
    await logAudit(tx, {
      actorId: actor.id,
      action: "REVOKE",
      entity: "ApprovalRequest",
      entityId: request.id,
      before: { status: request.status, level: step.level, approvedBy: step.actedById },
      after: { status: "PENDING", currentLevel: step.level, reason, wasFinal },
    });

    // Approver level itu (selain yang membatalkan) diberi tahu bahwa pengajuan menunggu lagi.
    const recipients = step.approverIds.filter((id) => id !== actor.id);
    return {
      status: "PENDING",
      notifications: recipients.length ? [{ template: "approval-requested", recipientIds: recipients, requestId: request.id }] : [],
    };
  });
}

// TODO(OI-05): alur Reject / Revisi ditunda. Status REJECTED sudah ada di enum RequestStatus &
// StepStatus, tetapi belum ada fungsi reject maupun UI-nya.

function unique(ids: string[]) {
  return [...new Set(ids)];
}
