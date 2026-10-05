// Query baca untuk halaman karyawan. Hasil sudah aman dikirim ke Client Component
// (tanpa BigInt; tanggal dikirim sebagai ISO string).
import type { Role } from "@/generated/prisma/enums";
import type { DocumentType, EmployeeStatus, PrismaClient } from "@/generated/prisma/client";
import { certificateStatus, daysUntil } from "@/lib/certificate-status";
import { documentCompleteness } from "@/lib/employee-documents";
import { profileCompleteness } from "@/lib/employee-profile";
import { toJakartaIsoDate } from "@/lib/format";

export type EmployeeListRow = {
  id: string;
  fullName: string;
  email: string;
  employeeNo: string | null;
  division: "SALES" | "ENGINEER" | "UMUM" | "DIRECTOR";
  position: string;
  role: Role | null;
  /** Tanggal masuk periode terakhir (YYYY-MM-DD). */
  startDate: string | null;
  /** Tanggal keluar periode terakhir (YYYY-MM-DD), untuk arsip. */
  endDate: string | null;
  profilePercent: number;
  profileMissing: string[];
  documentPercent: number;
  documentMissing: string[];
};

export async function listEmployees(db: PrismaClient, status: EmployeeStatus): Promise<EmployeeListRow[]> {
  const employees = await db.employee.findMany({
    where: { status },
    orderBy: { fullName: "asc" },
    include: {
      user: { select: { role: true } },
      periods: { orderBy: { startDate: "desc" }, take: 1 },
      documents: { where: { familyMemberId: null, deletedAt: null }, select: { docType: true } },
      family: {
        where: { deletedAt: null },
        select: { id: true, relation: true, fullName: true, documents: { where: { deletedAt: null }, select: { docType: true } } },
      },
    },
  });

  return employees.map((employee) => {
    const period = employee.periods[0];
    const completeness = profileCompleteness(employee);
    const documents = documentCompleteness(employee);
    return {
      id: employee.id,
      fullName: employee.fullName,
      email: employee.email,
      employeeNo: employee.employeeNo,
      division: employee.division,
      position: employee.position,
      role: employee.user?.role ?? null,
      startDate: period ? toJakartaIsoDate(period.startDate) : null,
      endDate: period?.endDate ? toJakartaIsoDate(period.endDate) : null,
      profilePercent: completeness.percent,
      profileMissing: completeness.missing,
      documentPercent: documents.percent,
      documentMissing: documents.missing,
    };
  });
}

/** Nilai awal form edit Admin: semua field sebagai string ("" untuk kosong). */
export async function getEmployeeFormValues(db: PrismaClient, employeeId: string) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    include: {
      user: { select: { role: true } },
      periods: { orderBy: { startDate: "desc" }, take: 1 },
    },
  });
  if (!employee) return null;

  return {
    id: employee.id,
    status: employee.status,
    values: {
      fullName: employee.fullName,
      email: employee.email,
      division: employee.division,
      role: employee.user?.role ?? "STAFF",
      position: employee.position,
      startDate: employee.periods[0] ? toJakartaIsoDate(employee.periods[0].startDate) : "",
      employeeNo: employee.employeeNo ?? "",
      level: employee.level ?? "",
      nik: employee.nik ?? "",
      kkNo: employee.kkNo ?? "",
      birthPlace: employee.birthPlace ?? "",
      birthDate: employee.birthDate ? toJakartaIsoDate(employee.birthDate) : "",
      gender: employee.gender ?? "",
      maritalStatus: employee.maritalStatus,
      address: employee.address ?? "",
      phone: employee.phone ?? "",
      npwp: employee.npwp ?? "",
      bpjsTkNo: employee.bpjsTkNo ?? "",
      bpjsKesNo: employee.bpjsKesNo ?? "",
      emergencyName: employee.emergencyName ?? "",
      emergencyRelation: employee.emergencyRelation ?? "",
      emergencyPhone: employee.emergencyPhone ?? "",
    },
  };
}

export type EmployeeFormValues = NonNullable<Awaited<ReturnType<typeof getEmployeeFormValues>>>["values"];

/** Detail karyawan untuk halaman /karyawan/[id] (Admin). */
export async function getEmployeeDetail(db: PrismaClient, employeeId: string) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    include: {
      user: { select: { id: true, role: true, isActive: true, lastLoginAt: true } },
      periods: { orderBy: { startDate: "desc" } },
    },
  });
  if (!employee) return null;

  const { user, periods, ...data } = employee;
  return {
    ...data,
    birthDate: data.birthDate ? toJakartaIsoDate(data.birthDate) : null,
    role: user?.role ?? null,
    userId: user?.id ?? null,
    accountActive: user?.isActive ?? false,
    lastLoginAt: user?.lastLoginAt?.toISOString() ?? null,
    periods: periods.map((period) => ({
      id: period.id,
      startDate: toJakartaIsoDate(period.startDate),
      endDate: period.endDate ? toJakartaIsoDate(period.endDate) : null,
      endReason: period.endReason,
    })),
    completeness: profileCompleteness(data),
  };
}

export type EmployeeDetail = NonNullable<Awaited<ReturnType<typeof getEmployeeDetail>>>;

const documentSelect = { id: true, docType: true, fileKey: true, fileName: true, createdAt: true } as const;

function toDocumentView(doc: { id: string; docType: DocumentType; fileKey: string; fileName: string; createdAt: Date }) {
  return { id: doc.id, docType: doc.docType, fileKey: doc.fileKey, fileName: doc.fileName, uploadedAt: doc.createdAt.toISOString() };
}

/** Dokumen & keluarga karyawan (tab Dokumen/Keluarga dan Profil Saya). */
export async function getEmployeeDocuments(db: PrismaClient, employeeId: string) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      status: true,
      maritalStatus: true,
      documents: { where: { familyMemberId: null, deletedAt: null }, select: documentSelect, orderBy: { createdAt: "asc" } },
      family: {
        where: { deletedAt: null },
        orderBy: [{ relation: "desc" }, { birthDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          relation: true,
          fullName: true,
          nik: true,
          birthDate: true,
          documents: { where: { deletedAt: null }, select: documentSelect, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!employee) return null;

  const documents = employee.documents.map(toDocumentView);
  const family = employee.family.map((member) => ({
    id: member.id,
    relation: member.relation,
    fullName: member.fullName,
    nik: member.nik,
    birthDate: member.birthDate ? toJakartaIsoDate(member.birthDate) : null,
    documents: member.documents.map(toDocumentView),
  }));
  return {
    employeeId: employee.id,
    status: employee.status,
    maritalStatus: employee.maritalStatus,
    documents,
    family,
    completeness: documentCompleteness({ maritalStatus: employee.maritalStatus, documents, family }),
  };
}

export type EmployeeDocuments = NonNullable<Awaited<ReturnType<typeof getEmployeeDocuments>>>;
export type DocumentView = EmployeeDocuments["documents"][number];
export type FamilyMemberView = EmployeeDocuments["family"][number];

/** Sertifikat & ijazah karyawan dengan status CERT-02 (dihitung per hari ini, Jakarta). */
export async function getEmployeeCertificates(db: PrismaClient, employeeId: string) {
  const today = toJakartaIsoDate();
  const certificates = await db.certificate.findMany({
    where: { employeeId, deletedAt: null },
    orderBy: [{ type: "asc" }, { startDate: "desc" }],
  });
  const requests = await db.approvalRequest.findMany({
    where: { module: "CERTIFICATE", entityId: { in: certificates.map((c) => c.id) } },
    select: { entityId: true, currentLevel: true },
  });
  const levelOf = new Map(requests.map((r) => [r.entityId, r.currentLevel]));
  return certificates.map((certificate) => {
    const endDate = certificate.endDate ? toJakartaIsoDate(certificate.endDate) : null;
    return {
      id: certificate.id,
      type: certificate.type,
      name: certificate.name,
      issuer: certificate.issuer,
      number: certificate.number,
      startDate: toJakartaIsoDate(certificate.startDate),
      endDate,
      fileKey: certificate.fileKey,
      status: certificateStatus(endDate, today),
      /** Verifikasi Ko Yosep → Bu Ika (Fase 14). */
      verification: certificate.status,
      verificationLevel: levelOf.get(certificate.id) ?? null,
      daysLeft: endDate ? daysUntil(endDate, today) : null,
    };
  });
}

export type CertificateView = Awaited<ReturnType<typeof getEmployeeCertificates>>[number];
