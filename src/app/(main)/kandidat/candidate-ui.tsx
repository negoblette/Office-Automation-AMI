"use client";

import { Loader2, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DocumentSlot } from "@/components/employee/document-slot";
import { DateInputField, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { Button } from "@/components/ui/button";
import { PERSONAL_DOCUMENT_TYPES } from "@/lib/employee-documents";
import { toJakartaIsoDate } from "@/lib/format";
import { CANDIDATE_STATUS_LABEL, DIVISION_LABEL, DOCUMENT_TYPE_LABEL, ROLE_LABEL, toOptions } from "@/lib/labels";
import type { CandidateDetail } from "@/lib/services/candidate-queries";
import { candidateSchema, convertCandidateSchema } from "@/lib/validators/candidate";
import {
  addCandidateDocumentAction,
  convertCandidateAction,
  deleteCandidateAction,
  deleteCandidateDocumentAction,
  saveCandidateAction,
} from "./actions";

export function CandidateDialog({ candidate }: { candidate?: CandidateDetail }) {
  const router = useRouter();
  return (
    <FormDialog
      wide
      trigger={
        candidate ? (
          <Button variant="outline" size="lg">
            <Pencil aria-hidden /> Ubah
          </Button>
        ) : (
          <Button size="lg">
            <Plus aria-hidden /> Kandidat
          </Button>
        )
      }
      title={candidate ? `Ubah ${candidate.fullName}` : "Tambah Kandidat"}
      schema={candidateSchema}
      defaults={{
        fullName: candidate?.fullName ?? "",
        email: candidate?.email ?? "",
        phone: candidate?.phone ?? "",
        nik: candidate?.nik ?? "",
        appliedPosition: candidate?.appliedPosition ?? "",
        status: candidate?.status ?? "APPLIED",
        notes: candidate?.notes ?? "",
      }}
      submitLabel="Simpan"
      action={async (values) => {
        const result = await saveCandidateAction(candidate?.id ?? null, values);
        if (result.ok && !candidate) router.push(`/kandidat/${result.data.candidateId}`);
        return result.ok ? { ok: true, data: undefined } : result;
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInputField name="fullName" label="Nama lengkap" required />
        <TextInputField name="appliedPosition" label="Posisi dilamar" required />
        <TextInputField name="email" label="Email" type="email" required />
        <TextInputField name="phone" label="Nomor HP" inputMode="tel" />
        <TextInputField name="nik" label="NIK" inputMode="numeric" placeholder="16 digit (opsional)" />
        <SelectInputField name="status" label="Status" required options={toOptions(CANDIDATE_STATUS_LABEL)} />
        <TextareaField name="notes" label="Catatan (hasil interview, dll.)" className="sm:col-span-2" />
      </div>
    </FormDialog>
  );
}

export function DeleteCandidateButton({ candidate }: { candidate: CandidateDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="destructive"
      size="lg"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Hapus kandidat ${candidate.fullName} beserta dokumennya?`)) return;
        startTransition(async () => {
          const result = await deleteCandidateAction(candidate.id);
          if (result.ok) router.push("/kandidat");
          else window.alert(result.error);
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />} Hapus
    </Button>
  );
}

/** Jadikan karyawan (CAN-03): nama & email dari data kandidat; Admin melengkapi data akun. */
export function ConvertCandidateDialog({ candidate }: { candidate: CandidateDetail }) {
  const router = useRouter();
  return (
    <FormDialog
      trigger={
        <Button size="lg">
          <UserCheck aria-hidden /> Jadikan Karyawan
        </Button>
      }
      title={`Jadikan ${candidate.fullName} karyawan`}
      description={`Akun login dibuat dengan email ${candidate.email}. NIK, HP, dan ${candidate.documents.length} dokumen dipindahkan otomatis.`}
      schema={convertCandidateSchema}
      defaults={{ division: "" as never, position: candidate.appliedPosition, startDate: toJakartaIsoDate(), role: "STAFF", password: "" }}
      submitLabel="Jadikan Karyawan"
      action={async (values) => {
        const result = await convertCandidateAction(candidate.id, values);
        if (result.ok) router.push(`/karyawan/${result.data.employeeId}`);
        return result.ok ? { ok: true, data: undefined } : result;
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInputField name="division" label="Divisi" required options={toOptions(DIVISION_LABEL)} />
        <TextInputField name="position" label="Jabatan" required />
        <DateInputField name="startDate" label="Tanggal masuk" required />
        <SelectInputField name="role" label="Role" required options={toOptions(ROLE_LABEL)} />
        <TextInputField
          name="password"
          label="Password awal"
          type="password"
          required
          autoComplete="new-password"
          className="sm:col-span-2"
          hint="Minimal 8 karakter. Berikan ke karyawan untuk login pertama."
        />
      </div>
    </FormDialog>
  );
}

/** Dokumen kandidat — jenis sama dengan dokumen pribadi karyawan (CAN-01). */
export function CandidateDocuments({ candidate }: { candidate: CandidateDetail }) {
  const canEdit = !candidate.convertedEmployeeId;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[...PERSONAL_DOCUMENT_TYPES, "OTHER" as const].map((type) => (
        <DocumentSlot
          key={type}
          label={type === "OTHER" ? "Dokumen Lainnya (CV, dll.)" : DOCUMENT_TYPE_LABEL[type]}
          required={false}
          documents={candidate.documents.filter((doc) => doc.docType === type)}
          canEdit={canEdit}
          target={{ employeeId: "", docType: type }}
          onAdd={(file) => addCandidateDocumentAction(candidate.id, { docType: type, fileKey: file.key, fileName: file.fileName })}
          onDelete={(documentId) => deleteCandidateDocumentAction(documentId)}
        />
      ))}
    </div>
  );
}
