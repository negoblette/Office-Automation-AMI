import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatPhone } from "@/lib/format";
import { CANDIDATE_STATUS_LABEL } from "@/lib/labels";
import { getCandidateDetail } from "@/lib/services/candidate-queries";
import { CANDIDATE_STATUS_VARIANT } from "../candidate-table";
import { CandidateDialog, CandidateDocuments, ConvertCandidateDialog, DeleteCandidateButton } from "../candidate-ui";

export const metadata: Metadata = { title: "Detail Kandidat" };

export default async function KandidatDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const candidate = await getCandidateDetail(prisma, id);
  if (!candidate) notFound();
  const converted = Boolean(candidate.convertedEmployeeId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={candidate.fullName}
        breadcrumbs={[{ label: "SDM" }, { label: "Kandidat", href: "/kandidat" }, { label: candidate.fullName }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            Melamar {candidate.appliedPosition}
            <StatusBadge variant={CANDIDATE_STATUS_VARIANT[candidate.status]}>{CANDIDATE_STATUS_LABEL[candidate.status]}</StatusBadge>
          </span>
        }
        actions={
          converted ? (
            <Link href={`/karyawan/${candidate.convertedEmployeeId}`} className={buttonVariants({ size: "lg" })}>
              Lihat data karyawan
            </Link>
          ) : (
            <>
              <DeleteCandidateButton candidate={candidate} />
              <CandidateDialog candidate={candidate} />
              {candidate.status === "ACCEPTED" && <ConvertCandidateDialog candidate={candidate} />}
            </>
          )
        }
      />

      {converted && (
        <p className="rounded-xl bg-success-soft px-4 py-3 text-sm">
          Kandidat ini sudah menjadi karyawan; data &amp; dokumennya sudah dipindahkan ke data karyawan.
        </p>
      )}

      <section className="grid gap-4 rounded-2xl bg-card p-5 shadow-card sm:grid-cols-4">
        {[
          ["Email", candidate.email],
          ["Nomor HP", candidate.phone ? formatPhone(candidate.phone) : "—"],
          ["NIK", candidate.nik ?? "—"],
          ["Dokumen", `${candidate.completeness.filled}/${candidate.completeness.total} dokumen pribadi`],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
            <p className="mt-1 font-medium break-all">{value}</p>
          </div>
        ))}
        {candidate.notes && <p className="text-sm whitespace-pre-line text-muted-foreground sm:col-span-4">{candidate.notes}</p>}
      </section>

      {!converted && (
        <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
          <h2 className="mb-4 text-base font-semibold">Dokumen Kandidat</h2>
          <CandidateDocuments candidate={candidate} />
        </section>
      )}
    </div>
  );
}
