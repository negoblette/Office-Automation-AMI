"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { CheckboxField, DateInputField, SelectInputField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { FormField } from "@/components/form/form-field";
import { RupiahInput } from "@/components/form/rupiah-input";
import { useFeedback } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { toJakartaIsoDate } from "@/lib/format";
import { PAYMENT_METHOD_LABEL, PROJECT_TYPE_LABEL, toOptions } from "@/lib/labels";
import type { CustomerWithProjects } from "@/lib/services/project-queries";
import { customerSchema, projectExpenseSchema, projectSchema } from "@/lib/validators/project";
import {
  deleteCustomerAction,
  saveCustomerAction,
  saveProjectAction,
  submitProjectExpenseAction,
} from "./actions";

export function CustomerDialog({
  customer,
  trigger,
  onCreated,
}: {
  customer?: { id: string; name: string };
  trigger?: React.ReactElement;
  onCreated?: (id: string) => void;
}) {
  return (
    <FormDialog<typeof customerSchema, { id: string }>
      trigger={
        trigger ??
        (customer ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${customer.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="lg">
            <Plus aria-hidden /> Tambah Customer
          </Button>
        ))
      }
      onSuccess={(data) => onCreated?.(data.id)}
      title={customer ? `Ubah ${customer.name}` : "Tambah Customer"}
      schema={customerSchema}
      defaults={{ name: customer?.name ?? "" }}
      submitLabel="Simpan"
      action={(values) => saveCustomerAction(customer?.id ?? null, values)}
    >
      <TextInputField name="name" label="Nama customer" required />
    </FormDialog>
  );
}

export function DeleteCustomerButton({ customer }: { customer: CustomerWithProjects }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, notify } = useFeedback();
  if (customer.projects.length || customer.reimburseCount) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Hapus ${customer.name}`}
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({ title: `Hapus customer "${customer.name}"?`, confirmLabel: "Hapus", tone: "danger" });
        if (!ok) return;
        startTransition(async () => {
          const result = await deleteCustomerAction(customer.id);
          if (result.ok) {
            notify("Customer dihapus");
            router.refresh();
          } else notify(result.error, "danger");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 />}
    </Button>
  );
}

export function ProjectDialog({
  customers,
  customerId,
  project,
  suggestedCode,
  canSetActive = true,
  trigger,
  onCreated,
}: {
  customers: { value: string; label: string }[];
  customerId?: string;
  project?: { id: string; code: string | null; name: string; type: "RUNNING" | "NEW_ACQUISITION"; isActive: boolean; customerId: string };
  /** Saran ID untuk project baru (mis. PRJ-0004). */
  suggestedCode?: string;
  /** false untuk non-Admin: project baru selalu aktif. */
  canSetActive?: boolean;
  trigger?: React.ReactElement;
  onCreated?: (project: { id: string; customerId: string }) => void;
}) {
  return (
    <FormDialog<typeof projectSchema, { id: string; customerId: string }>
      trigger={
        trigger ??
        (project ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${project.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus aria-hidden /> Project
          </Button>
        ))
      }
      onSuccess={(data) => onCreated?.(data)}
      title={project ? `Ubah ${project.name}` : "Tambah Project"}
      schema={projectSchema}
      defaults={{
        customerId: project?.customerId ?? customerId ?? "",
        code: project?.code ?? suggestedCode ?? "",
        name: project?.name ?? "",
        type: project?.type ?? "RUNNING",
        isActive: project?.isActive ?? true,
      }}
      submitLabel="Simpan"
      action={(values) => saveProjectAction(project?.id ?? null, values)}
    >
      <SelectInputField name="customerId" label="Customer" required options={customers} />
      <TextInputField name="code" label="ID project" required placeholder="mis. PRJ-0012" hint="Tampil sebagai &quot;ID - Nama Project&quot;." />
      <TextInputField name="name" label="Nama project" required />
      <SelectInputField name="type" label="Jenis" required options={toOptions(PROJECT_TYPE_LABEL)} />
      {canSetActive && <CheckboxField name="isActive" label="Project aktif" hint="Project nonaktif tidak muncul di pilihan reimburse/expense baru." />}
    </FormDialog>
  );
}

function AmountField() {
  const { control, formState } = useFormContext();
  return (
    <FormField label="Nominal" htmlFor="entry-amount" required error={formState.errors.amount?.message as string | undefined}>
      <Controller
        control={control}
        name="amount"
        render={({ field }) => (
          <RupiahInput
            id="entry-amount"
            value={field.value as number | null}
            onChange={field.onChange}
            onBlur={field.onBlur}
            aria-required
            aria-invalid={formState.errors.amount ? true : undefined}
            aria-describedby="entry-amount-description"
          />
        )}
      />
    </FormField>
  );
}

/** Input expense project (PRJ-02) → approval. */
export function ExpenseDialog({
  projectId,
  revise,
}: {
  projectId: string;
  /** Revisi expense yang ditolak (2026-10-12): nomor tetap, diajukan ulang. */
  revise?: { id: string; number: string; date: string; description: string; paymentMethod: "PERSONAL" | "CORPORATE"; amount: number };
}) {
  return (
    <FormDialog
      trigger={
        revise ? (
          <Button size="sm" variant="outline">
            <Pencil aria-hidden /> Revisi
          </Button>
        ) : (
          <Button size="lg" className="bg-foreground text-background hover:bg-foreground/90">
            <Plus aria-hidden /> Input Expense
          </Button>
        )
      }
      title={revise ? `Revisi Expense ${revise.number}` : "Input Expense Project"}
      description="Diajukan ke approval (alur sama dengan reimburse)."
      schema={projectExpenseSchema}
      defaults={
        revise
          ? { date: revise.date, description: revise.description, paymentMethod: revise.paymentMethod, amount: revise.amount }
          : { date: toJakartaIsoDate(), description: "", paymentMethod: "PERSONAL", amount: null as unknown as number }
      }
      submitLabel={revise ? "Ajukan Ulang" : "Ajukan"}
      successMessage={revise ? "Expense diajukan ulang" : "Expense diajukan"}
      action={(values) => submitProjectExpenseAction(projectId, values, revise?.id ?? null)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <DateInputField name="date" label="Tanggal" required />
        <SelectInputField name="paymentMethod" label="Pembayaran" required options={toOptions(PAYMENT_METHOD_LABEL)} />
      </div>
      <TextInputField name="description" label="Keterangan" required />
      <AmountField />
    </FormDialog>
  );
}
