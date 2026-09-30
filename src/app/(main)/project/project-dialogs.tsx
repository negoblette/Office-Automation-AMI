"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { CheckboxField, DateInputField, SelectInputField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { FormField } from "@/components/form/form-field";
import { RupiahInput } from "@/components/form/rupiah-input";
import { Button } from "@/components/ui/button";
import { toJakartaIsoDate } from "@/lib/format";
import { PAYMENT_METHOD_LABEL, PROJECT_TYPE_LABEL, toOptions } from "@/lib/labels";
import type { CustomerWithProjects } from "@/lib/services/project-queries";
import { customerSchema, projectExpenseSchema, projectRevenueSchema, projectSchema } from "@/lib/validators/project";
import {
  deleteCustomerAction,
  saveCustomerAction,
  saveProjectAction,
  submitProjectExpenseAction,
  submitProjectRevenueAction,
} from "./actions";

export function CustomerDialog({ customer }: { customer?: { id: string; name: string } }) {
  return (
    <FormDialog
      trigger={
        customer ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${customer.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="lg">
            <Plus aria-hidden /> Customer
          </Button>
        )
      }
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
  if (customer.projects.length || customer.reimburseCount) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Hapus ${customer.name}`}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Hapus customer "${customer.name}"?`)) return;
        startTransition(async () => {
          const result = await deleteCustomerAction(customer.id);
          if (result.ok) router.refresh();
          else window.alert(result.error);
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}

export function ProjectDialog({
  customers,
  customerId,
  project,
}: {
  customers: { value: string; label: string }[];
  customerId?: string;
  project?: { id: string; name: string; type: "RUNNING" | "NEW_ACQUISITION"; isActive: boolean; customerId: string };
}) {
  return (
    <FormDialog
      trigger={
        project ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${project.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus aria-hidden /> Project
          </Button>
        )
      }
      title={project ? `Ubah ${project.name}` : "Tambah Project"}
      schema={projectSchema}
      defaults={{
        customerId: project?.customerId ?? customerId ?? "",
        name: project?.name ?? "",
        type: project?.type ?? "RUNNING",
        isActive: project?.isActive ?? true,
      }}
      submitLabel="Simpan"
      action={(values) => saveProjectAction(project?.id ?? null, values)}
    >
      <SelectInputField name="customerId" label="Customer" required options={customers} />
      <TextInputField name="name" label="Nama project" required />
      <SelectInputField name="type" label="Jenis" required options={toOptions(PROJECT_TYPE_LABEL)} />
      <CheckboxField name="isActive" label="Project aktif" hint="Project nonaktif tidak muncul di pilihan reimburse/expense baru." />
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
        render={({ field }) => <RupiahInput id="entry-amount" value={field.value as number | null} onChange={field.onChange} onBlur={field.onBlur} />}
      />
    </FormField>
  );
}

/** Input expense project (PRJ-02) → approval. */
export function ExpenseDialog({ projectId }: { projectId: string }) {
  return (
    <FormDialog
      trigger={
        <Button size="lg" className="bg-foreground text-background hover:bg-foreground/90">
          <Plus aria-hidden /> Input Expense
        </Button>
      }
      title="Input Expense Project"
      description="Diajukan ke approval (alur sama dengan reimburse)."
      schema={projectExpenseSchema}
      defaults={{ date: toJakartaIsoDate(), description: "", paymentMethod: "CASH", amount: null as unknown as number }}
      submitLabel="Ajukan"
      action={(values) => submitProjectExpenseAction(projectId, values)}
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

/** Input revenue project (PRJ-04, OI-06: field minimal). */
export function RevenueDialog({ projectId }: { projectId: string }) {
  return (
    <FormDialog
      trigger={
        <Button size="lg" variant="outline">
          <Plus aria-hidden /> Input Revenue
        </Button>
      }
      title="Input Revenue Project"
      description="Diajukan ke approval (alur sama dengan reimburse)."
      schema={projectRevenueSchema}
      defaults={{ date: toJakartaIsoDate(), description: "", amount: null as unknown as number }}
      submitLabel="Ajukan"
      action={(values) => submitProjectRevenueAction(projectId, values)}
    >
      <DateInputField name="date" label="Tanggal" required />
      <TextInputField name="description" label="Keterangan" required />
      <AmountField />
    </FormDialog>
  );
}
