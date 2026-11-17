// Query halaman Peminjaman Unit / Product Trial Form (Fase 16, 2026-11-17). Tanggal sebagai ISO string (aman ke client).
import type { AssetCategory, AssetOwnership, DemoLoanStatus, LoanPurpose, PrismaClient, RequestStatus } from "@/generated/prisma/client";
import type { ApprovalStepView } from "@/components/shared/approval-stepper";
import { approverRoleLabel } from "@/components/shared/approval-status";
import type { SelectOption } from "@/components/form/select-field";
import { ACTIVE_LOAN_STATUSES, DEMO_LOAN_STATUS_LABEL, formatLoanDuration, groupLoanItems, LOAN_SALES_DIVISION } from "@/lib/demo-loan";
import { toJakartaIsoDate } from "@/lib/format";
import { ownershipText, rackLocationLabel } from "@/lib/inventory";

const iso = (date: Date) => toJakartaIsoDate(date);
const personName = (user: { email: string; employee: { fullName: string } | null }) => user.employee?.fullName ?? user.email;

export type LoanRow = {
  id: string;
  number: string;
  status: DemoLoanStatus;
  purpose: LoanPurpose;
  /** Detail kegunaan "Lainnya". */
  purposeDetail: string | null;
  borrowerName: string;
  picName: string;
  requesterId: string;
  requesterName: string;
  salesPersonName: string;
  startDate: string;
  dueDate: string;
  durationLabel: string;
  itemCount: number;
  /** "SFP+ (10G) ×4 · Switch 24 port" */
  itemSummary: string;
  submittedAt: string;
  /** Sedang dipinjam & sudah lewat jatuh tempo. */
  overdue: boolean;
};

const rowInclude = {
  requester: { select: { email: true, employee: { select: { fullName: true } } } },
  salesPerson: { select: { fullName: true } },
  items: { select: { deviceName: true, serialNo: true }, orderBy: { id: "asc" } },
} as const;

type RowSource = {
  id: string;
  number: string;
  status: DemoLoanStatus;
  purpose: LoanPurpose;
  purposeDetail: string | null;
  borrowerName: string;
  picName: string;
  requesterId: string;
  startDate: Date;
  dueDate: Date;
  submittedAt: Date;
  requester: { email: string; employee: { fullName: string } | null };
  salesPerson: { fullName: string };
  items: { deviceName: string; serialNo: string }[];
};

function toRow(loan: RowSource, today: string): LoanRow {
  const dueDate = iso(loan.dueDate);
  return {
    id: loan.id,
    number: loan.number,
    status: loan.status,
    purpose: loan.purpose,
    purposeDetail: loan.purposeDetail,
    borrowerName: loan.borrowerName,
    picName: loan.picName,
    requesterId: loan.requesterId,
    requesterName: personName(loan.requester),
    salesPersonName: loan.salesPerson.fullName,
    startDate: iso(loan.startDate),
    dueDate,
    durationLabel: formatLoanDuration(iso(loan.startDate), dueDate),
    itemCount: loan.items.length,
    itemSummary: groupLoanItems(loan.items)
      .map((group) => (group.serials.length > 1 ? `${group.deviceName} ×${group.serials.length}` : group.deviceName))
      .join(" · "),
    submittedAt: loan.submittedAt.toISOString(),
    overdue: loan.status === "ON_LOAN" && dueDate < today,
  };
}

/** Semua peminjaman, terbaru dulu. Semua user Inventaris boleh melihat (transparansi lokasi unit). */
export async function listDemoLoans(db: PrismaClient, today = toJakartaIsoDate()): Promise<LoanRow[]> {
  const loans = await db.demoLoan.findMany({ orderBy: { submittedAt: "desc" }, include: rowInclude });
  return loans.map((loan) => toRow(loan, today));
}

export type LoanItemView = {
  id: string;
  assetId: string;
  deviceName: string;
  serialNo: string;
  /** Posisi saat diajukan, mis. "Rak 1 · A1". */
  location: string | null;
  /** Posisi unit sekarang (bisa sudah dipindah); null = tidak di rak. */
  currentLocation: string | null;
  category: AssetCategory;
};

export type LoanDetail = LoanRow & {
  customerId: string | null;
  picEmail: string;
  salesPersonId: string;
  remarks: string | null;
  approvedAt: string | null;
  itemSenderId: string | null;
  itemSenderName: string | null;
  /** Operational yang menyiapkan (memilih Item Sender) — kolom "Operational" di form cetak. */
  operationalName: string | null;
  /** Barang diantar (Tahap 16.3). */
  deliveredAt: string | null;
  receivedByName: string | null;
  /** Approval (Approval Flow modul DEMO_LOAN). */
  approval: {
    /** Status ApprovalRequest; null = belum ada. */
    status: RequestStatus | null;
    currentLevel: number | null;
    steps: ApprovalStepView[];
    /** Alasan tolak terakhir (status REJECTED). */
    rejection: { reason: string; by: string; at: string } | null;
    /** Sudah ada level yang menyetujui sementara masih menunggu level berikutnya → pemohon tidak bisa mengubah lagi. */
    partlyApproved: boolean;
  };
  items: LoanItemView[];
};

async function approvalOf(db: PrismaClient, loanId: string): Promise<LoanDetail["approval"]> {
  const request = await db.approvalRequest.findUnique({
    where: { module_entityId: { module: "DEMO_LOAN", entityId: loanId } },
    include: { steps: { orderBy: { level: "asc" } } },
  });
  if (!request) return { status: null, currentLevel: null, steps: [], rejection: null, partlyApproved: false };
  const userIds = request.steps.flatMap((step) => [...step.approverIds, ...(step.actedById ? [step.actedById] : [])]);
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, role: true, employee: { select: { fullName: true } } } });
  const nameOf = new Map(users.map((user) => [user.id, user.employee?.fullName ?? user.email]));
  const roleOf = new Map(users.map((user) => [user.id, user.role]));
  const rejected = request.steps.find((step) => step.status === "REJECTED");
  return {
    status: request.status,
    currentLevel: request.currentLevel,
    steps: request.steps.map((step) => ({
      level: step.level,
      approvers: step.approverIds.map((id) => nameOf.get(id) ?? "—"),
      approverLabel: approverRoleLabel(step.approverIds.map((id) => roleOf.get(id))),
      status: step.status,
      actedBy: step.actedById ? (nameOf.get(step.actedById) ?? null) : null,
      actedAt: step.actedAt?.toISOString() ?? null,
      note: step.status === "REJECTED" ? step.note : null,
    })),
    rejection:
      request.status === "REJECTED" && rejected
        ? {
            reason: rejected.note ?? "",
            by: rejected.actedById ? (nameOf.get(rejected.actedById) ?? "approver") : "approver",
            at: (rejected.actedAt ?? request.completedAt ?? request.createdAt).toISOString(),
          }
        : null,
    partlyApproved: request.status === "PENDING" && request.steps.some((step) => step.status === "APPROVED" && step.actedById),
  };
}

export async function getDemoLoanDetail(db: PrismaClient, loanId: string, today = toJakartaIsoDate()): Promise<LoanDetail | null> {
  const loan = await db.demoLoan.findUnique({
    where: { id: loanId },
    include: {
      ...rowInclude,
      itemSender: { select: { fullName: true } },
      operational: { select: { email: true, employee: { select: { fullName: true } } } },
      items: {
        orderBy: { id: "asc" },
        include: { rack: { select: { name: true } }, asset: { select: { category: true, rackPosition: true, rack: { select: { name: true } } } } },
      },
    },
  });
  if (!loan) return null;
  return {
    ...toRow(loan, today),
    customerId: loan.customerId,
    picEmail: loan.picEmail,
    salesPersonId: loan.salesPersonId,
    remarks: loan.remarks,
    approvedAt: loan.approvedAt?.toISOString() ?? null,
    itemSenderId: loan.itemSenderId,
    itemSenderName: loan.itemSender?.fullName ?? null,
    operationalName: loan.operational ? personName(loan.operational) : null,
    deliveredAt: loan.deliveredAt ? iso(loan.deliveredAt) : null,
    receivedByName: loan.receivedByName,
    approval: await approvalOf(db, loan.id),
    items: loan.items.map((item) => ({
      id: item.id,
      assetId: item.assetId,
      deviceName: item.deviceName,
      serialNo: item.serialNo,
      location: rackLocationLabel(item.rack?.name, item.rackPosition),
      currentLocation: rackLocationLabel(item.asset.rack?.name, item.asset.rackPosition),
      category: item.asset.category,
    })),
  };
}

export type LoanUnitOption = {
  id: string;
  deviceName: string;
  serialNo: string;
  category: AssetCategory;
  location: string | null;
  /** Kepemilikan: milik AMI atau titipan principal / distributor (label "Principal · Cisco"). */
  ownership: AssetOwnership;
  ownerLabel: string;
  /** Alasan tidak bisa dipilih, mis. "Dipinjam · PT Bank Danamon"; null = tersedia. */
  unavailable: string | null;
};

export type LoanFormOptions = {
  units: LoanUnitOption[];
  /** Nama Customer aktif untuk saran isian peminjam (boleh juga diketik bebas). */
  customers: string[];
  salesPeople: SelectOption[];
};

/** Pilihan form pengajuan. `exceptLoanId` = peminjaman yang sedang direvisi (unitnya sendiri tetap bisa dipilih). */
export async function getLoanFormOptions(db: PrismaClient, exceptLoanId?: string): Promise<LoanFormOptions> {
  const [assets, customers, sales] = await Promise.all([
    db.asset.findMany({
      where: { deletedAt: null },
      orderBy: [{ deviceName: "asc" }, { serialNo: "asc" }],
      include: {
        rack: { select: { name: true } },
        loanItems: {
          where: { loan: { status: { in: [...ACTIVE_LOAN_STATUSES] }, ...(exceptLoanId ? { id: { not: exceptLoanId } } : {}) } },
          select: { loan: { select: { status: true, borrowerName: true } } },
          take: 1,
        },
      },
    }),
    db.customer.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { name: true } }),
    db.employee.findMany({ where: { status: "ACTIVE", division: LOAN_SALES_DIVISION }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
  ]);
  return {
    units: assets.map((asset) => {
      const busy = asset.loanItems[0]?.loan;
      return {
        id: asset.id,
        deviceName: asset.deviceName,
        serialNo: asset.serialNo,
        category: asset.category,
        location: rackLocationLabel(asset.rack?.name, asset.rackPosition),
        ownership: asset.ownership,
        ownerLabel: ownershipText(asset.ownership, asset.ownerName),
        unavailable: busy ? `${DEMO_LOAN_STATUS_LABEL[busy.status]} · ${busy.borrowerName}` : null,
      };
    }),
    customers: customers.map((customer) => customer.name),
    salesPeople: sales.map((employee) => ({ value: employee.id, label: employee.fullName })),
  };
}

/** Karyawan aktif untuk pilihan Item Sender (pengantar barang). */
export async function getItemSenderOptions(db: PrismaClient): Promise<SelectOption[]> {
  const employees = await db.employee.findMany({ where: { status: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, position: true } });
  return employees.map((employee) => ({ value: employee.id, label: `${employee.fullName} — ${employee.position}` }));
}

/** Peminjaman yang sudah disetujui & menunggu disiapkan Operational (belum diantar), terlama dulu. */
export async function loansAwaitingOperational(db: PrismaClient): Promise<string[]> {
  const loans = await db.demoLoan.findMany({ where: { status: "APPROVED" }, orderBy: { approvedAt: "asc" }, select: { id: true } });
  return loans.map((loan) => loan.id);
}

export type AssetLoanHistoryRow = {
  loanId: string;
  number: string;
  status: DemoLoanStatus;
  purpose: LoanPurpose;
  purposeDetail: string | null;
  borrowerName: string;
  startDate: string;
  dueDate: string;
  durationLabel: string;
};

/** Peminjaman yang memuat unit ini (halaman detail unit), terbaru dulu. */
export async function assetLoanHistory(db: PrismaClient, assetId: string): Promise<AssetLoanHistoryRow[]> {
  const items = await db.demoLoanItem.findMany({
    where: { assetId },
    orderBy: { loan: { submittedAt: "desc" } },
    select: {
      loan: { select: { id: true, number: true, status: true, purpose: true, purposeDetail: true, borrowerName: true, startDate: true, dueDate: true } },
    },
  });
  return items.map(({ loan }) => ({
    loanId: loan.id,
    number: loan.number,
    status: loan.status,
    purpose: loan.purpose,
    purposeDetail: loan.purposeDetail,
    borrowerName: loan.borrowerName,
    startDate: iso(loan.startDate),
    dueDate: iso(loan.dueDate),
    durationLabel: formatLoanDuration(iso(loan.startDate), iso(loan.dueDate)),
  }));
}
