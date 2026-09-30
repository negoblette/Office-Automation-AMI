"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";
import {
  addFamilyMemberAction,
  deleteFamilyMemberAction,
  updateFamilyMemberAction,
} from "@/app/(main)/dokumen-actions";
import { DateInputField, TextInputField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { EmptyState } from "@/components/shared/empty-state";
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
import type { FamilyRelation } from "@/generated/prisma/enums";
import { hasFamilySection } from "@/lib/employee-documents";
import { formatDate, toJakartaIsoDate } from "@/lib/format";
import { DOCUMENT_TYPE_LABEL, FAMILY_RELATION_LABEL, MARITAL_STATUS_LABEL } from "@/lib/labels";
import type { EmployeeDocuments, FamilyMemberView } from "@/lib/services/employee-queries";
import { familyMemberSchema } from "@/lib/validators/family";
import { DocumentSlot } from "./document-slot";

type Props = { data: EmployeeDocuments; canEdit: boolean };

/** Data & dokumen keluarga (DOC-02): surat nikah/cerai, pasangan + KTP, anak + akte. */
export function FamilyPanel({ data, canEdit }: Props) {
  if (!hasFamilySection(data.maritalStatus)) {
    return (
      <EmptyState
        icon={Users}
        title="Status pernikahan: Belum menikah"
        description="Data dan dokumen keluarga diisi jika status pernikahan di Data Diri adalah Menikah atau Cerai."
      />
    );
  }

  const spouse = data.family.find((member) => member.relation === "SPOUSE");
  const children = data.family.filter((member) => member.relation === "CHILD");
  const married = data.maritalStatus === "MARRIED";

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
        <h2 className="mb-1 text-base font-semibold">Pernikahan</h2>
        <p className="mb-4 text-sm text-muted-foreground">Status: {MARITAL_STATUS_LABEL[data.maritalStatus]}</p>
        <DocumentSlot
          className="max-w-md"
          label={DOCUMENT_TYPE_LABEL.SURAT_NIKAH_CERAI}
          documents={data.documents.filter((doc) => doc.docType === "SURAT_NIKAH_CERAI")}
          canEdit={canEdit}
          target={{ employeeId: data.employeeId, docType: "SURAT_NIKAH_CERAI" }}
        />
      </section>

      {married && (
        <FamilySection
          title="Suami / Istri"
          action={!spouse && canEdit && <FamilyMemberDialog employeeId={data.employeeId} relation="SPOUSE" />}
        >
          {spouse ? (
            <MemberCard member={spouse} employeeId={data.employeeId} canEdit={canEdit} />
          ) : (
            <p className="text-sm text-muted-foreground">Data suami/istri belum ditambahkan (wajib untuk status Menikah).</p>
          )}
        </FamilySection>
      )}

      <FamilySection title="Anak" action={canEdit && <FamilyMemberDialog employeeId={data.employeeId} relation="CHILD" />}>
        {children.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {children.map((child) => (
              <MemberCard key={child.id} member={child} employeeId={data.employeeId} canEdit={canEdit} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada data anak. Akte kelahiran wajib untuk setiap anak yang ditambahkan.</p>
        )}
      </FamilySection>
    </div>
  );
}

function FamilySection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MemberCard({ member, employeeId, canEdit }: { member: FamilyMemberView; employeeId: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const docType = member.relation === "SPOUSE" ? "KTP_PASANGAN" : "AKTE_KELAHIRAN_ANAK";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{member.fullName}</p>
          <p className="text-sm text-muted-foreground">
            {FAMILY_RELATION_LABEL[member.relation]}
            {member.nik && ` · NIK ${member.nik}`}
            {member.birthDate && ` · lahir ${formatDate(`${member.birthDate}T00:00:00Z`)}`}
          </p>
        </div>
        {canEdit && (
          <div className="flex shrink-0">
            <FamilyMemberDialog employeeId={employeeId} relation={member.relation} member={member} />
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={pending}
              aria-label={`Hapus ${member.fullName}`}
              onClick={() => {
                if (!window.confirm(`Hapus data ${member.fullName} beserta dokumennya?`)) return;
                setError(null);
                startTransition(async () => {
                  const result = await deleteFamilyMemberAction(member.id);
                  if (result.ok) router.refresh();
                  else setError(result.error);
                });
              }}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      <DocumentSlot
        label={DOCUMENT_TYPE_LABEL[docType]}
        documents={member.documents}
        canEdit={canEdit}
        target={{ employeeId, docType, familyMemberId: member.id }}
      />
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type FormInput = z.input<typeof familyMemberSchema>;
type FormOutput = z.output<typeof familyMemberSchema>;

function FamilyMemberDialog({
  employeeId,
  relation,
  member,
}: {
  employeeId: string;
  relation: FamilyRelation;
  member?: FamilyMemberView;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const defaults = { relation, fullName: member?.fullName ?? "", nik: member?.nik ?? "", birthDate: member?.birthDate ?? "" };
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(familyMemberSchema), defaultValues: defaults });
  const { serverError, pending, submit } = useActionSubmit(form);
  const label = FAMILY_RELATION_LABEL[relation];

  const onSubmit = form.handleSubmit((values) =>
    submit(
      () => (member ? updateFamilyMemberAction(member.id, values) : addFamilyMemberAction(employeeId, values)),
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
        if (next) form.reset(defaults);
      }}
    >
      <DialogTrigger
        render={
          member ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${member.fullName}`} />
          ) : (
            <Button variant="outline" size="sm" />
          )
        }
      >
        {member ? (
          <Pencil />
        ) : (
          <>
            <Plus aria-hidden /> Tambah {label}
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{member ? `Edit ${member.fullName}` : `Tambah ${label}`}</DialogTitle>
            </DialogHeader>
            <FormAlert message={serverError} />
            <TextInputField name="fullName" label="Nama lengkap" required />
            <TextInputField name="nik" label="NIK" inputMode="numeric" placeholder="16 digit (opsional)" />
            <DateInputField name="birthDate" label="Tanggal lahir" max={toJakartaIsoDate()} />
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
