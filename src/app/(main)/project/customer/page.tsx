import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";
import { listCustomersWithProjects } from "@/lib/services/project-queries";
import { CustomerDialog, DeleteCustomerButton, ProjectDialog } from "../project-dialogs";

export const metadata: Metadata = { title: "Customer & Project" };

export default async function CustomerProjectPage() {
  await requireAdmin();
  const customers = await listCustomersWithProjects(prisma);
  const customerOptions = customers.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customer & Project"
        description="Master customer dan project (PRJ-01). Customer baru juga otomatis tercatat saat staf mengetik nama company di reimburse."
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Project", href: "/project" }, { label: "Customer & Project" }]}
        actions={<CustomerDialog />}
      />

      {customers.length === 0 ? (
        <EmptyState icon={Building2} title="Belum ada customer" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {customers.map((customer) => (
            <section key={customer.id} className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{customer.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {customer.projects.length} project · {customer.reimburseCount} baris reimburse
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <ProjectDialog customers={customerOptions} customerId={customer.id} />
                  <CustomerDialog customer={customer} />
                  <DeleteCustomerButton customer={customer} />
                </div>
              </div>
              {customer.projects.length > 0 && (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {customer.projects.map((project) => (
                    <li key={project.id} className="flex items-center gap-3 px-3 py-2">
                      <Link href={`/project/${project.id}`} className="flex-1 text-sm font-medium hover:underline">
                        {project.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">{PROJECT_TYPE_LABEL[project.type]}</span>
                      <StatusBadge variant={project.isActive ? "success" : "neutral"} dot={false}>
                        {project.isActive ? "Aktif" : "Nonaktif"}
                      </StatusBadge>
                      <ProjectDialog customers={customerOptions} project={project} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
