import { FileDown, UserX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { FEATURES } from "@/lib/features";

const TABS = [
  { key: "data-diri", label: "Data Diri", href: "/profil" },
  { key: "dokumen", label: "Dokumen & Keluarga", href: "/profil/dokumen" },
  { key: "sertifikat", label: "Sertifikat & Ijazah", href: "/profil/sertifikat" },
  { key: "aset", label: "Aset Saya", href: "/profil/aset" },
  { key: "inventory", label: "Inventory Saya", href: "/profil/inventory" },
].filter((tab) => tab.key !== "inventory" || FEATURES.inventory);

/** Kepala halaman + tab untuk semua halaman Profil Saya. */
export function ProfileShell({
  active,
  title,
  description,
  children,
  employeeId,
}: {
  active: string;
  title: string;
  description: string;
  children: React.ReactNode;
  /** Bila diisi, tampil tombol "Download Biodata (PDF)". */
  employeeId?: string | null;
}) {
  const tab = TABS.find((t) => t.key === active);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[{ label: "Profil Saya", href: "/profil" }, ...(tab && tab.key !== "data-diri" ? [{ label: tab.label }] : [])]}
        actions={
          employeeId ? (
            <Link href={`/biodata/${employeeId}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              <FileDown aria-hidden /> Download Biodata (PDF)
            </Link>
          ) : undefined
        }
      />
      <LinkTabs label="Profil Saya" active={active} tabs={TABS} />
      {children}
    </div>
  );
}

/** Akun tanpa data karyawan (seharusnya tidak terjadi untuk akun yang dibuat lewat aplikasi). */
export function NoEmployeeRecord() {
  return (
    <EmptyState icon={UserX} title="Akun belum terhubung ke data karyawan" description="Hubungi Admin untuk menghubungkan akun Anda." />
  );
}
