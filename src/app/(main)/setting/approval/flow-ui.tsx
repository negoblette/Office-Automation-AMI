"use client";

import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type FieldValues, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { CheckboxField, CheckboxGroupField, SelectInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import type { SelectOption } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { APPROVAL_MODULE_META } from "@/lib/approval-modules";
import type { ActionResult } from "@/lib/actions";
import { DIVISION_LABEL, toOptions } from "@/lib/labels";
import type { FlowView } from "@/lib/services/approval-flow";
import { approvalFlowSchema, fallbackFlowSchema } from "@/lib/validators/setting";
import { deleteFlowAction, saveFlowAction, setFlowActiveAction } from "./actions";

// Revenue project tidak dipakai lagi (permintaan 2026-10-05) → tidak ditawarkan untuk alur baru.
const MODULE_OPTIONS = Object.entries(APPROVAL_MODULE_META)
  .filter(([value]) => value !== "REVENUE")
  .map(([value, meta]) => ({ value, label: meta.label }));

/** Editor level approval: tiap level berisi satu atau beberapa approver (salah satu cukup). */
function StepsEditor({ approvers }: { approvers: SelectOption[] }) {
  const { control, formState } = useFormContext<FieldValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "steps" });
  const rootError = (formState.errors.steps as { message?: string; root?: { message?: string } } | undefined)?.root?.message
    ?? (formState.errors.steps as { message?: string } | undefined)?.message;
  return (
    <div className="flex flex-col gap-3">
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-start gap-2 rounded-xl border border-border p-3">
          <CheckboxGroupField className="flex-1" name={`steps.${index}.approverIds`} label={`Level ${index + 1}`} required options={approvers} />
          {fields.length > 1 && (
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Hapus level ${index + 1}`} onClick={() => remove(index)}>
              <X />
            </Button>
          )}
        </div>
      ))}
      {rootError && (
        <p role="alert" className="text-xs font-medium text-danger">
          {rootError}
        </p>
      )}
      {fields.length < 5 && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => append({ approverIds: [] })}>
          <Plus aria-hidden /> Tambah level
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Level berurutan. Beberapa approver dalam satu level = salah satu cukup. Level yang berisi pemohon sendiri otomatis dilewati.
      </p>
    </div>
  );
}

/** Opsi flow biasa: tanpa approval (level disembunyikan) atau editor level + opsi otomatis. */
function RegularFlowOptions({ approvers }: { approvers: SelectOption[] }) {
  const { control, setValue } = useFormContext<FieldValues>();
  const noApproval = useWatch({ control, name: "noApproval" }) as boolean;
  return (
    <>
      <CheckboxField
        name="noApproval"
        label="Tanpa approval"
        hint="Pengajuan langsung disetujui (tetap tercatat), mis. cuti divisi Direktur."
        onCheckedChange={(checked) => setValue("steps", checked ? [] : [{ approverIds: [] }])}
      />
      {!noApproval && (
        <>
          <StepsEditor approvers={approvers} />
          <CheckboxField
            name="autoApproveWhenSkipped"
            label="Jika pemohon adalah approver-nya sendiri, langsung disetujui"
            hint="Bila tidak dicentang, pengajuan diteruskan ke flow Fallback."
          />
        </>
      )}
    </>
  );
}

export function FlowDialog({ flow, approvers }: { flow?: FlowView; approvers: SelectOption[] }) {
  const steps = flow?.steps.map((s) => ({ approverIds: s.approvers.filter((a) => a.usable).map((a) => a.id) })) ?? [{ approverIds: [] }];
  const trigger = flow ? (
    <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${flow.label}`}>
      <Pencil />
    </Button>
  ) : (
    <Button size="lg">
      <Plus aria-hidden /> Flow
    </Button>
  );
  const description = "Perubahan hanya berlaku untuk pengajuan baru; pengajuan yang sedang berjalan tetap memakai alur saat diajukan.";

  if (flow?.scope === "FALLBACK") {
    return (
      <FormDialog
        wide
        trigger={trigger}
        title="Ubah Flow Fallback"
        description={`Dipakai bila semua level flow biasa terlewati (pemohon adalah approver-nya sendiri). ${description}`}
        schema={fallbackFlowSchema}
        defaults={{ steps }}
        submitLabel="Simpan"
        action={(values) => saveFlowAction(flow.id, true, values)}
      >
        <StepsEditor approvers={approvers} />
      </FormDialog>
    );
  }

  return (
    <FormDialog
      wide
      trigger={trigger}
      title={flow ? `Ubah ${flow.label}` : "Tambah Approval Flow"}
      description={description}
      schema={approvalFlowSchema}
      defaults={{
        module: flow?.module ?? ("" as never),
        division: flow?.division ?? "",
        noApproval: Boolean(flow && flow.steps.length === 0),
        autoApproveWhenSkipped: flow?.autoApproveWhenSkipped ?? false,
        steps: flow && flow.steps.length === 0 ? [] : steps,
      }}
      submitLabel="Simpan"
      action={(values) => saveFlowAction(flow?.id ?? null, false, values)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInputField name="module" label="Modul" required options={MODULE_OPTIONS} />
        <SelectInputField
          name="division"
          label="Divisi pemohon"
          options={[{ value: "", label: "Semua divisi" }, ...toOptions(DIVISION_LABEL)]}
          hint="Flow divisi spesifik diutamakan daripada flow semua divisi."
        />
      </div>
      <RegularFlowOptions approvers={approvers} />
    </FormDialog>
  );
}

function useFlowAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (confirmText: string, action: () => Promise<ActionResult>) => {
    if (!window.confirm(confirmText)) return;
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  };
  return { pending, error, run };
}

export function FlowActions({ flow }: { flow: FlowView }) {
  const { pending, error, run } = useFlowAction();
  if (flow.scope === "FALLBACK") return null;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              flow.isActive
                ? `Nonaktifkan ${flow.label}? Pengajuan baru modul ini akan memakai flow "Semua divisi" (jika ada) atau ditolak.`
                : `Aktifkan ${flow.label}?`,
              () => setFlowActiveAction(flow.id, !flow.isActive),
            )
          }
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {flow.isActive ? "Nonaktifkan" : "Aktifkan"}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Hapus ${flow.label}`}
          disabled={pending}
          onClick={() => run(`Hapus ${flow.label}? Pengajuan yang sudah berjalan tidak terpengaruh.`, () => deleteFlowAction(flow.id))}
        >
          <Trash2 />
        </Button>
      </div>
      {error && (
        <p role="alert" className="max-w-72 text-right text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
