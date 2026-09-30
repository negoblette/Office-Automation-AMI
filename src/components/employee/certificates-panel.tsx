"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Award, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";
import { addCertificateAction, deleteCertificateAction, updateCertificateAction } from "@/app/(main)/sertifikat-actions";
import { DateInputField, SelectInputField, TextInputField } from "@/components/form/fields";
import { FileUpload } from "@/components/form/file-upload";
import { FormAlert } from "@/components/form/form-actions";
import { FormField } from "@/components/form/form-field";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { EmptyState } from "@/components/shared/empty-state";
import { FileChip } from "@/components/shared/file-chip";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CERTIFICATE_STATUS_BADGE } from "@/lib/certificate-status";
import { formatDate } from "@/lib/format";
import { CERTIFICATE_TYPE_LABEL, toOptions } from "@/lib/labels";
import type { CertificateView } from "@/lib/services/employee-queries";
import { certificateSchema } from "@/lib/validators/certificate";

const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

/** Daftar sertifikat & ijazah (CERT-01/02) dengan tambah/ubah/hapus. */
export function CertificatesPanel({
  employeeId,
  certificates,
  canEdit,
}: {
  employeeId: string;
  certificates: CertificateView[];
  canEdit: boolean;
}) {
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Sertifikat & Ijazah</h2>
          <p className="text-sm text-muted-foreground">Status &ldquo;Akan kadaluarsa&rdquo; muncul 30 hari sebelum tanggal berakhir.</p>
        </div>
        {canEdit && <CertificateDialog employeeId={employeeId} />}
      </div>

      {certificates.length === 0 ? (
        <EmptyState icon={Award} title="Belum ada sertifikat" description="Tambahkan sertifikat profesional atau ijazah." className="shadow-none" />
      ) : (
        <ul className="divide-y divide-border">
          {certificates.map((certificate) => (
            <CertificateRow key={certificate.id} employeeId={employeeId} certificate={certificate} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CertificateRow({ employeeId, certificate, canEdit }: { employeeId: string; certificate: CertificateView; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const badge = CERTIFICATE_STATUS_BADGE[certificate.status];

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{certificate.name}</p>
          <StatusBadge variant={badge.variant}>
            {badge.label}
            {certificate.status === "EXPIRING" && certificate.daysLeft !== null && ` · ${certificate.daysLeft} hari lagi`}
          </StatusBadge>
        </div>
        <p className="text-sm text-muted-foreground">
          {CERTIFICATE_TYPE_LABEL[certificate.type]}
          {certificate.issuer && ` · ${certificate.issuer}`}
          {certificate.number && ` · No. ${certificate.number}`}
        </p>
        <p className="text-sm text-muted-foreground">
          Berlaku {date(certificate.startDate)} – {certificate.endDate ? date(certificate.endDate) : "seumur hidup"}
        </p>
        {error && (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {certificate.fileKey ? (
          <FileChip fileKey={certificate.fileKey} fileName={`${certificate.name}.${certificate.fileKey.split(".").pop()}`} className="max-w-56" />
        ) : (
          <span className="text-sm text-muted-foreground">Tanpa file</span>
        )}
        {canEdit && (
          <>
            <CertificateDialog employeeId={employeeId} certificate={certificate} />
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={pending}
              aria-label={`Hapus ${certificate.name}`}
              onClick={() => {
                if (!window.confirm(`Hapus sertifikat "${certificate.name}"?`)) return;
                setError(null);
                startTransition(async () => {
                  const result = await deleteCertificateAction(certificate.id);
                  if (result.ok) router.refresh();
                  else setError(result.error);
                });
              }}
            >
              <Trash2 />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

type FormInput = z.input<typeof certificateSchema>;
type FormOutput = z.output<typeof certificateSchema>;

function CertificateDialog({ employeeId, certificate }: { employeeId: string; certificate?: CertificateView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Nama file hanya untuk tampilan di form; yang disimpan adalah key.
  const [fileName, setFileName] = useState<string | null>(null);
  const defaults: FormInput = {
    type: certificate?.type ?? "PROFESSIONAL",
    name: certificate?.name ?? "",
    issuer: certificate?.issuer ?? "",
    number: certificate?.number ?? "",
    startDate: certificate?.startDate ?? "",
    endDate: certificate?.endDate ?? "",
    fileKey: certificate?.fileKey ?? "",
  };
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(certificateSchema), defaultValues: defaults });
  const { serverError, pending, submit } = useActionSubmit(form);

  const onSubmit = form.handleSubmit((values) =>
    submit(
      () => (certificate ? updateCertificateAction(certificate.id, values) : addCertificateAction(employeeId, values)),
      () => {
        setOpen(false);
        router.refresh();
      },
    ),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          form.reset(defaults);
          setFileName(certificate?.fileKey ? `${certificate.name}.${certificate.fileKey.split(".").pop()}` : null);
        }
      }}
    >
      <DialogTrigger
        render={
          certificate ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${certificate.name}`} />
          ) : (
            <Button variant="outline" size="sm" />
          )
        }
      >
        {certificate ? (
          <Pencil />
        ) : (
          <>
            <Plus aria-hidden /> Tambah Sertifikat
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <FormProvider {...form}>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{certificate ? `Edit ${certificate.name}` : "Tambah Sertifikat / Ijazah"}</DialogTitle>
            </DialogHeader>
            <FormAlert message={serverError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectInputField name="type" label="Jenis" required options={toOptions(CERTIFICATE_TYPE_LABEL)} />
              <TextInputField name="name" label="Nama" required placeholder="mis. Cisco CCNA" />
              <TextInputField name="issuer" label="Penerbit" />
              <TextInputField name="number" label="Nomor" />
              <DateInputField name="startDate" label="Tanggal terbit" required />
              <DateInputField name="endDate" label="Berlaku sampai" hint="Kosongkan jika seumur hidup" />
            </div>
            <FormField label="File" htmlFor="certificate-file" error={form.formState.errors.fileKey?.message}>
              <Controller
                control={form.control}
                name="fileKey"
                render={({ field }) => (
                  <FileUpload
                    id="certificate-file"
                    value={field.value && fileName ? { key: String(field.value), fileName, mimeType: "", sizeBytes: 0 } : null}
                    onChange={(file) => {
                      setFileName(file?.fileName ?? null);
                      field.onChange(file?.key ?? "");
                    }}
                  />
                )}
              />
            </FormField>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Batal</DialogClose>
              <Button type="submit" disabled={pending}>
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
