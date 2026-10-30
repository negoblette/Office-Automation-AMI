// Label Bahasa Indonesia untuk enum database. Aman dipakai di Client Component.
import type { AssetCategory, CandidateStatus, CertificateType, DocumentType, EducationLevel, FamilyRelation, Gender, LeaveType, MaritalStatus, PaymentMethod, ProjectType, Role } from "@/generated/prisma/enums";

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  ANNUAL: "Cuti tahunan",
  MATERNITY: "Cuti melahirkan",
  BEREAVEMENT: "Cuti kematian",
};

/** "potong saldo" / "tidak potong saldo" / "potong saldo 2 dari 4 hari" (2026-10-30). */
export function leaveDeductLabel(deductDays: number, workingDays: number): string {
  if (deductDays === 0) return "tidak potong saldo";
  return deductDays >= workingDays ? "potong saldo" : `potong saldo ${deductDays} dari ${workingDays} hari`;
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  APPROVER: "Approver",
  STAFF: "Staf",
};

export const GENDER_LABEL: Record<Gender, string> = {
  MALE: "Laki-laki",
  FEMALE: "Perempuan",
};

export const MARITAL_STATUS_LABEL: Record<MaritalStatus, string> = {
  SINGLE: "Belum menikah",
  MARRIED: "Menikah",
  DIVORCED: "Cerai hidup",
  WIDOWED: "Cerai mati",
};

export const FAMILY_RELATION_LABEL: Record<FamilyRelation, string> = {
  SPOUSE: "Suami / Istri",
  CHILD: "Anak",
};

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  KTP: "KTP",
  KK: "Kartu Keluarga",
  NPWP: "NPWP Pribadi",
  PAS_FOTO: "Pas Foto 4x6",
  SIM: "SIM A/C",
  BPJS_TK: "BPJS Ketenagakerjaan",
  BPJS_KES: "BPJS Kesehatan",
  IJAZAH_TRANSKRIP: "Ijazah + Transkrip",
  SKCK: "SKCK",
  SURAT_NIKAH_CERAI: "Surat Nikah / Cerai",
  KTP_PASANGAN: "KTP Suami / Istri",
  AKTE_KELAHIRAN_ANAK: "Akte Kelahiran Anak",
  OTHER: "Lainnya",
};

export const EDUCATION_LEVEL_LABEL: Record<EducationLevel, string> = {
  SMA_SMK: "SMA/SMK",
  D1: "D1",
  D2: "D2",
  D3: "D3",
  D4: "D4",
  S1: "S1",
  S2: "S2",
  S3: "S3",
};

export const CERTIFICATE_TYPE_LABEL: Record<CertificateType, string> = {
  PROFESSIONAL: "Sertifikat Profesional",
  IJAZAH: "Ijazah",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PERSONAL: "Personal",
  CORPORATE: "Corporate",
};

export const ASSET_CATEGORY_LABEL: Record<AssetCategory, string> = {
  DEMO_UNIT: "Demo Unit",
  BACKUP_UNIT: "Backup Unit",
  INVENTORY: "Inventory",
};

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  RUNNING: "Berjalan",
  NEW_ACQUISITION: "New Acquisition",
};

export const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
  APPLIED: "Melamar",
  INTERVIEW: "Interview",
  ACCEPTED: "Diterima",
  REJECTED: "Ditolak",
};

/** Opsi dropdown dari map label, urutan mengikuti deklarasi. */
export function toOptions<T extends string>(labels: Record<T, string>): { value: T; label: string }[] {
  return (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));
}

/** "ID - Nama Project" (Fase 14); project tanpa ID tampil namanya saja. */
export function projectLabel(project: { code: string | null; name: string }): string {
  return project.code ? `${project.code} - ${project.name}` : project.name;
}
