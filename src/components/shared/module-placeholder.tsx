import { Construction } from "lucide-react";
import { EmptyState } from "./empty-state";
import { type BreadcrumbItem, PageHeader } from "./page-header";

type ModulePlaceholderProps = {
  title: string;
  description: string;
  breadcrumbs: BreadcrumbItem[];
  /** Nomor fase di docs/PLAN.md tempat modul ini dikerjakan. */
  phase: number;
};

/** Halaman sementara untuk route yang modulnya belum dikerjakan. */
export function ModulePlaceholder({ title, description, breadcrumbs, phase }: ModulePlaceholderProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} breadcrumbs={breadcrumbs} />
      <EmptyState
        icon={Construction}
        title="Modul belum tersedia"
        description={`Modul ini dikerjakan di Fase ${phase}.`}
      />
    </div>
  );
}
