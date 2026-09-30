import { LinkTabs } from "@/components/shared/link-tabs";

/** Tab halaman Karyawan: Aktif / Arsip (Resign). */
export function KaryawanTabs({ active, activeCount, archiveCount }: { active: "aktif" | "arsip"; activeCount: number; archiveCount: number }) {
  return (
    <LinkTabs
      label="Status karyawan"
      active={active}
      tabs={[
        { key: "aktif", label: "Karyawan Aktif", href: "/karyawan", count: activeCount },
        { key: "arsip", label: "Arsip (Resign)", href: "/karyawan/arsip", count: archiveCount },
      ]}
    />
  );
}
