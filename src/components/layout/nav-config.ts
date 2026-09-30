import {
  Briefcase,
  CalendarDays,
  CheckCheck,
  Clock,
  HeartPulse,
  LayoutGrid,
  MonitorSmartphone,
  ReceiptText,
  Settings,
  UserPlus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { FEATURES } from "@/lib/features";

export type AppRole = "ADMIN" | "STAFF";

export type NavChild = {
  label: string;
  href: string;
  adminOnly?: boolean;
};

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Label pengganti untuk Staf, mis. "Project" (Staf hanya melihat, tanpa Customer). */
  staffLabel?: string;
  children?: NavChild[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

/**
 * Menu sidebar sesuai docs/06-DESAIN-UI.md §2 dan hak akses docs/04-MAPPING-MENU.md.
 * Menyembunyikan menu bukan pengamanan — setiap page Admin memanggil `requireAdmin()`.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Utama",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
      { label: "Absensi", href: "/absensi", icon: Clock },
      {
        label: "Profil Saya",
        href: "/profil",
        icon: UserRound,
        children: [
          { label: "Data Diri", href: "/profil" },
          { label: "Dokumen & Keluarga", href: "/profil/dokumen" },
          { label: "Sertifikat & Ijazah", href: "/profil/sertifikat" },
          ...(FEATURES.inventory ? [{ label: "Inventory Saya", href: "/profil/inventory" }] : []),
        ],
      },
    ],
  },
  {
    label: "Sumber Daya Manusia",
    items: [
      {
        label: "Karyawan & Dokumen",
        href: "/karyawan",
        icon: Users,
        adminOnly: true,
        children: [
          { label: "Daftar Aktif", href: "/karyawan" },
          { label: "Arsip", href: "/karyawan/arsip" },
        ],
      },
      { label: "Kandidat", href: "/kandidat", icon: UserPlus, adminOnly: true },
    ],
  },
  {
    label: "Operasional & Aset",
    items: [
      ...(FEATURES.inventory ? [{ label: "Inventory / Demo Unit", href: "/inventory", icon: MonitorSmartphone, adminOnly: true }] : []),
      {
        label: "Project & Customer",
        href: "/project",
        icon: Briefcase,
        staffLabel: "Project",
        children: [
          { label: "Daftar Project", href: "/project" },
          { label: "Customer & Project", href: "/project/customer", adminOnly: true },
        ],
      },
    ],
  },
  {
    label: "Pengajuan & Keuangan",
    items: [
      {
        label: "Reimburse",
        href: "/reimburse",
        icon: ReceiptText,
        children: [
          { label: "Daftar Reimburse", href: "/reimburse" },
          { label: "Pengajuan Baru", href: "/reimburse/baru" },
        ],
      },
      {
        label: "Cuti & Libur",
        href: "/cuti",
        icon: CalendarDays,
        children: [
          { label: "Pengajuan Cuti", href: "/cuti" },
          { label: "Saldo Cuti", href: "/cuti/saldo" },
          { label: "Kalender Libur", href: "/cuti/kalender" },
        ],
      },
      {
        label: "Kesehatan & Plafon",
        href: "/kesehatan",
        icon: HeartPulse,
        children: [
          { label: "Klaim Kesehatan", href: "/kesehatan" },
          { label: "Jadwal Pembayaran", href: "/kesehatan/pembayaran", adminOnly: true },
        ],
      },
    ],
  },
  {
    label: "Kontrol & Sistem",
    items: [
      // Badge jumlah approval pending: dihitung di (main)/layout.tsx.
      { label: "Approval", href: "/approval", icon: CheckCheck, adminOnly: true },
      {
        label: "Setting",
        href: "/setting",
        icon: Settings,
        adminOnly: true,
        children: [
          { label: "Ringkasan", href: "/setting" },
          { label: "User & Role", href: "/setting/user" },
          { label: "Approval Flow", href: "/setting/approval" },
          { label: "Jatah Cuti & Carry Over", href: "/setting/cuti" },
          { label: "Plafon Kesehatan", href: "/setting/kesehatan" },
          { label: "Master Data", href: "/setting/master" },
        ],
      },
    ],
  },
];

/** Menu yang boleh dilihat role tertentu; grup kosong dibuang. */
export function getNavForRole(role: AppRole): NavGroup[] {
  const isAdmin = role === "ADMIN";
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => isAdmin || !item.adminOnly)
      .map((item) => {
        const children = item.children?.filter((child) => isAdmin || !child.adminOnly);
        // Sub-menu dengan satu isi saja tidak perlu ditampilkan.
        return {
          ...item,
          label: !isAdmin && item.staffLabel ? item.staffLabel : item.label,
          children: children && children.length > 1 ? children : undefined,
        };
      }),
  })).filter((group) => group.items.length > 0);
}

/** Route aktif jika sama persis atau berada di bawahnya. */
export function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sub-menu aktif = href terpanjang yang cocok (supaya `/cuti/saldo` tidak ikut menyalakan `/cuti`). */
export function getActiveChildHref(pathname: string, children: NavChild[]): string | undefined {
  return children
    .filter((child) => isPathActive(pathname, child.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
