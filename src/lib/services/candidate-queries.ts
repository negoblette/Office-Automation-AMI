// Query halaman Kandidat.
import type { CandidateStatus, PrismaClient } from "@/generated/prisma/client";
import { PERSONAL_DOCUMENT_TYPES } from "@/lib/employee-documents";
import { toJakartaIsoDate } from "@/lib/format";

export type CandidateRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  appliedPosition: string;
  status: CandidateStatus;
  documentCount: number;
  convertedEmployeeId: string | null;
  createdAt: string;
};

export async function listCandidates(db: PrismaClient): Promise<CandidateRow[]> {
  const candidates = await db.candidate.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { documents: { where: { deletedAt: null } } } } },
  });
  return candidates.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    appliedPosition: c.appliedPosition,
    status: c.status,
    documentCount: c._count.documents,
    convertedEmployeeId: c.convertedEmployeeId,
    createdAt: toJakartaIsoDate(c.createdAt),
  }));
}

export async function getCandidateDetail(db: PrismaClient, candidateId: string) {
  const candidate = await db.candidate.findUnique({
    where: { id: candidateId, deletedAt: null },
    include: { documents: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
  });
  if (!candidate) return null;
  const documents = candidate.documents.map((doc) => ({
    id: doc.id,
    docType: doc.docType,
    fileKey: doc.fileKey,
    fileName: doc.fileName,
    uploadedAt: doc.createdAt.toISOString(),
  }));
  const present = new Set(documents.map((d) => d.docType));
  return {
    id: candidate.id,
    fullName: candidate.fullName,
    email: candidate.email,
    phone: candidate.phone,
    nik: candidate.nik,
    appliedPosition: candidate.appliedPosition,
    status: candidate.status,
    notes: candidate.notes,
    convertedEmployeeId: candidate.convertedEmployeeId,
    documents,
    completeness: { filled: PERSONAL_DOCUMENT_TYPES.filter((t) => present.has(t)).length, total: PERSONAL_DOCUMENT_TYPES.length },
  };
}
export type CandidateDetail = NonNullable<Awaited<ReturnType<typeof getCandidateDetail>>>;
