import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignmentHistory } from "@/components/employee/assignment-history";
import { CertificatesPanel } from "@/components/employee/certificates-panel";
import { PersonalDocumentsPanel } from "@/components/employee/documents-panel";
import { FamilyPanel } from "@/components/employee/family-panel";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { PersonAvatar } from "@/components/shared/person-cell";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime, formatNpwp, formatPhone, formatTenure } from "@/lib/format";
import { DIVISION_LABEL, GENDER_LABEL, MARITAL_STATUS_LABEL, ROLE_LABEL } from "@/lib/labels";
import {
  type EmployeeDetail,
  getEmployeeCertificates,
  getEmployeeDetail,
  getEmployeeDocuments,
} from "@/lib/services/employee-queries";
import { listEmployeeAssets } from "@/lib/services/asset-queries";
import { RehireButton, ResignButton } from "../employee-status-actions";
import { FEATURES } from "@/lib/features";
import { EmployeeAssetsPanel } from "@/components/employee/employee-assets-panel";
import { listEmployeeAssetItems } from "@/lib/services/employee-asset";

export const metadata: Metadata = { title: "Detail Karyawan" };

const TABS = [
  { key: "data-diri", label: "Data Diri" },
  { key: "keluarga", label: "Keluarga" },
  { key: "dokumen", label: "Dokumen" },
  { key: "sertifikat", label: "Sertifikat" },
  { key: "aset", label: "Aset" },
  { key: "inventory", label: "Inventory" },
  { key: "riwayat", label: "Riwayat Kerja" },
] as const;
const VISIBLE_TABS = TABS.filter((t) => t.key !== "inventory" || FEATURES.inventory);
type TabKey = (typeof TABS)[number]["key"];

const date = (iso: string | null) => (iso ? formatDate(`${iso}T00:00:00Z`) : null);

export default async function DetailKaryawanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin();
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const [employee, documents] = await Promise.all([getEmployeeDetail(prisma, id), getEmployeeDocuments(prisma, id)]);
  if (!employee || !documents) notFound();

  const activeTab: TabKey = VISIBLE_TABS.some((t) => t.key === tab) ? (tab as TabKey) : "data-diri";
  const isActive = employee.status === "ACTIVE";
  const currentPeriod = employee.periods[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={employee.fullName}
        breadcrumbs={[
          { label: "SDM" },
          isActive ? { label: "Karyawan & Dokumen", href: "/karyawan" } : { label: "Arsip", href: "/karyawan/arsip" },
          { label: employee.fullName },
        ]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {employee.position} · {DIVISION_LABEL[employee.division]}
            <StatusBadge variant={isActive ? "success" : "neutral"}>{isActive ? "Aktif" : "Resign"}</StatusBadge>
          </span>
        }
        actions={
          <>
            <Link href={`/biodata/${employee.id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Biodata (PDF)
            </Link>
            <Link href={`/karyawan/${employee.id}/edit`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Pencil aria-hidden /> Edit
            </Link>
            {isActive ? (
              <ResignButton employeeId={employee.id} name={employee.fullName} />
            ) : (
              <RehireButton employeeId={employee.id} name={employee.fullName} lastEndDate={currentPeriod?.endDate ?? null} />
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-card p-5 shadow-card">
        <PersonAvatar name={employee.fullName} />
        <dl className="grid flex-1 grid-cols-2 gap-4 text-sm sm:grid-cols-3 xl:grid-cols-5">
          <Summary label="Email" value={employee.email} />
          <Summary label="Role" value={employee.role ? ROLE_LABEL[employee.role] : "—"} />
          <Summary
            label={isActive ? "Masa kerja" : "Keluar"}
            value={
              isActive
                ? currentPeriod
                  ? `${formatTenure(`${currentPeriod.startDate}T00:00:00Z`)} (sejak ${date(currentPeriod.startDate)})`
                  : "—"
                : date(currentPeriod?.endDate ?? null) ?? "—"
            }
          />
          <Summary
            label="Dokumen"
            value={
              <StatusBadge variant={documents.completeness.percent === 100 ? "success" : "warning"}>
                {documents.completeness.percent === 100 ? "Lengkap" : `${documents.completeness.filled}/${documents.completeness.total}`}
              </StatusBadge>
            }
          />
          <Summary
            label="Data diri"
            value={
              <StatusBadge variant={employee.completeness.percent === 100 ? "success" : "warning"}>
                {employee.completeness.percent === 100 ? "Lengkap" : `${employee.completeness.percent}%`}
              </StatusBadge>
            }
          />
        </dl>
      </div>

      <LinkTabs
        label="Detail karyawan"
        active={activeTab}
        tabs={VISIBLE_TABS.map((t) => ({ key: t.key, label: t.label, href: `/karyawan/${employee.id}?tab=${t.key}` }))}
      />

      {activeTab === "data-diri" && <PersonalData employee={employee} />}
      {activeTab === "riwayat" && <EmploymentHistory periods={employee.periods} />}
      {activeTab === "aset" && <EmployeeAssetsPanel employeeId={employee.id} assets={await listEmployeeAssetItems(prisma, employee.id)} canEdit />}
      {activeTab === "keluarga" && <FamilyPanel data={documents} canEdit />}
      {activeTab === "dokumen" && <PersonalDocumentsPanel data={documents} canEdit />}
      {activeTab === "sertifikat" && (
        <CertificatesPanel employeeId={employee.id} certificates={await getEmployeeCertificates(prisma, employee.id)} canEdit canEditVerified />
      )}
      {activeTab === "inventory" && <AssignmentHistory rows={await listEmployeeAssets(prisma, employee.id)} mode="employee" />}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 truncate font-medium">{value}</dd>
    </div>
  );
}

function InfoSection({ title, items }: { title: string; items: [string, React.ReactNode][] }) {
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</dt>
            <dd className="mt-1 text-sm">{value || <span className="text-muted-foreground">Belum diisi</span>}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PersonalData({ employee }: { employee: EmployeeDetail }) {
  const { completeness } = employee;
  return (
    <div className="flex flex-col gap-6">
      {completeness.missing.length > 0 && (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-foreground">
          <span className="font-semibold">Belum dilengkapi karyawan:</span> {completeness.missing.join(", ")}.
        </p>
      )}
      <InfoSection
        title="Akun & Pekerjaan"
        items={[
          ["NIP", employee.employeeNo ?? "Belum ada"],
          ["Level / grade", employee.level],
          ["Status akun", employee.accountActive ? "Aktif" : "Nonaktif"],
          ["Login terakhir", employee.lastLoginAt ? formatDateTime(employee.lastLoginAt) : "Belum pernah login"],
        ]}
      />
      <InfoSection
        title="Data Diri"
        items={[
          ["NIK", employee.nik],
          ["Nomor KK", employee.kkNo],
          ["Tempat lahir", employee.birthPlace],
          ["Tanggal lahir", date(employee.birthDate)],
          ["Jenis kelamin", employee.gender ? GENDER_LABEL[employee.gender] : null],
          ["Status pernikahan", MARITAL_STATUS_LABEL[employee.maritalStatus]],
          ["Nomor HP", employee.phone ? formatPhone(employee.phone) : null],
          ["Alamat", employee.address],
        ]}
      />
      <InfoSection
        title="Pajak & BPJS"
        items={[
          ["NPWP", employee.npwp ? formatNpwp(employee.npwp) : null],
          ["BPJS Ketenagakerjaan", employee.bpjsTkNo],
          ["BPJS Kesehatan", employee.bpjsKesNo],
        ]}
      />
    </div>
  );
}

function EmploymentHistory({ periods }: { periods: EmployeeDetail["periods"] }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-card shadow-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-3">Mulai</th>
            <th className="px-4 py-3">Selesai</th>
            <th className="px-4 py-3">Lama</th>
            <th className="px-4 py-3">Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period.id} className="border-t border-border">
              <td className="px-4 py-3">{date(period.startDate)}</td>
              <td className="px-4 py-3">{date(period.endDate) ?? "—"}</td>
              <td className="px-4 py-3">
                {formatTenure(`${period.startDate}T00:00:00Z`, period.endDate ? `${period.endDate}T00:00:00Z` : undefined)}
              </td>
              <td className="px-4 py-3">
                {period.endDate ? (
                  <StatusBadge variant="neutral">{period.endReason === "RESIGN" ? "Resign" : (period.endReason ?? "Selesai")}</StatusBadge>
                ) : (
                  <StatusBadge variant="success">Aktif</StatusBadge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
