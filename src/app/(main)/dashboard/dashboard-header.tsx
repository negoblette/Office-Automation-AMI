import { type BreadcrumbItem, PageHeader } from "@/components/shared/page-header";
import styles from "./dashboard.module.css";
import { Dial } from "./dashboard-motion";

/**
 * Kepala halaman Dashboard: `PageHeader` bersama, ditambah jam analog dan gerak pembuka Dashboard.
 * Jam analog hanya tampil bila tidak ada tombol aksi di kanan, supaya tidak menutupi tombol.
 */
export function DashboardHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  breadcrumbs: BreadcrumbItem[];
  actions?: React.ReactNode;
}) {
  return (
    <PageHeader
      title={title}
      description={description}
      breadcrumbs={breadcrumbs}
      actions={actions}
      decoration={!actions && <Dial />}
      riseClassName={styles.rise}
    />
  );
}
