import { ProgressBar } from "@/components/shared/progress-bar";
import { DOCUMENT_GROUP_I, PERSONAL_GROUP_II } from "@/lib/employee-documents";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import type { EmployeeDocuments } from "@/lib/services/employee-queries";
import { DocumentSlot } from "./document-slot";

/** Ringkasan kelengkapan dokumen (DOC-03). */
export function DocumentCompletenessCard({ completeness }: { completeness: EmployeeDocuments["completeness"] }) {
  const complete = completeness.missing.length === 0;
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Kelengkapan Dokumen</h2>
        <span className="text-sm font-medium tabular-nums">
          {completeness.filled} / {completeness.total} ({completeness.percent}%)
        </span>
      </div>
      <ProgressBar value={completeness.percent} tone={complete ? "success" : "warning"} />
      <p className="mt-3 text-sm text-muted-foreground">
        {complete ? "Semua dokumen wajib sudah lengkap." : `Belum ada: ${completeness.missing.join(", ")}.`}
      </p>
    </section>
  );
}

/** Dokumen pribadi (DOC-01): satu kotak per jenis dokumen. */
export function PersonalDocumentsPanel({ data, canEdit }: { data: EmployeeDocuments; canEdit: boolean }) {
  const byType = (type: string) => data.documents.filter((doc) => doc.docType === type);
  return (
    <div className="flex flex-col gap-6">
      <DocumentCompletenessCard completeness={data.completeness} />
      <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
        <div className="mb-4 space-y-1">
          <h2 className="text-base font-semibold">Dokumen Pribadi</h2>
          <p className="text-sm text-muted-foreground">PDF, JPG, atau PNG, maksimal 5 MB per file.</p>
        </div>
        <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Kelompok I — Identitas</h3>
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {DOCUMENT_GROUP_I.map((type) => (
            <DocumentSlot
              key={type}
              label={DOCUMENT_TYPE_LABEL[type]}
              documents={byType(type)}
              canEdit={canEdit}
              target={{ employeeId: data.employeeId, docType: type }}
            />
          ))}
        </div>
        <h3 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Kelompok II — Pendukung</h3>
        <p className="mb-3 text-xs text-muted-foreground">Surat nikah/cerai, KTP pasangan, dan akte anak (juga Kelompok II) diunggah di bagian Keluarga.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PERSONAL_GROUP_II.map((type) => (
            <DocumentSlot
              key={type}
              label={DOCUMENT_TYPE_LABEL[type]}
              documents={byType(type)}
              canEdit={canEdit}
              target={{ employeeId: data.employeeId, docType: type }}
            />
          ))}
          <DocumentSlot
            label="Dokumen Lainnya"
            required={false}
            documents={byType("OTHER")}
            canEdit={canEdit}
            target={{ employeeId: data.employeeId, docType: "OTHER" }}
          />
        </div>
      </section>
    </div>
  );
}
