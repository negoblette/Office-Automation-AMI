import type { Role } from "@/generated/prisma/enums";
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
  Timer,
  UserPlus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { inventoryEnabled } from "@/lib/features";
import { canApprove } from "@/lib/roles";

export type AppRole = Role;

/** Yang menentukan isi menu: role, super admin (modul ditunda tetap terbuka), dan hak overtime (divisi Engineer). */
export type NavViewer = { role: AppRole; isSuperAdmin: boolean; canOvertime: boolean };

export type NavChild = {
  label: string;
  href: string;
  adminOnly?: boolean;
  /** Modul Inventory (ditunda; terbuka untuk super admin). */
  inventory?: boolean;
  /** Hanya karyawan yang boleh overtime (divisi Engineer). */
  overtime?: boolean;
};

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Bisa dilihat Admin & Approver (mis. halaman Approval). */
  approverOnly?: boolean;
  /** Label pengganti untuk Staf, mis. "Project" (Staf hanya melihat, tanpa Customer). */
  staffLabel?: string;
  /** Modul Inventory (ditunda; terbuka untuk super admin). */
  inventory?: boolean;
  /** Overtime: karyawan divisi Engineer + Admin (rekap), 2026-10-30. */
  overtime?: boolean;
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
      { label: "Overtime", href: "/overtime", icon: Timer, overtime: true },
      {
        label: "Profil Saya",
        href: "/profil",
        icon: UserRound,
        children: [
          { label: "Data Diri", href: "/profil" },
          { label: "Dokumen & Keluarga", href: "/profil/dokumen" },
          { label: "Sertifikat & Ijazah", href: "/profil/sertifikat" },
          { label: "Asset Kantor", href: "/profil/aset" },
          { label: "Inventory Saya", href: "/profil/inventory", inventory: true },
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
      { label: "Inventory / Demo Unit", href: "/inventory", icon: MonitorSmartphone, adminOnly: true, inventory: true },
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
          { label: "Reimburse Overtime", href: "/reimburse/overtime", overtime: true },
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
      { label: "Approval", href: "/approval", icon: CheckCheck, approverOnly: true },
      {
        label: "Setting",
        href: "/setting",
        icon: Settings,
        adminOnly: true,
        children: [
          { label: "Ringkasan", href: "/setting" },
          { label: "User & Role", href: "/setting/user" },
          { label: "Approval Flow", href: "/setting/approval" },
          { label: "Divisi", href: "/setting/divisi" },
          { label: "Jatah Cuti & Carry Over", href: "/setting/cuti" },
          { label: "Plafon Kesehatan", href: "/setting/kesehatan" },
          { label: "Master Data", href: "/setting/master" },
        ],
      },
    ],
  },
];

/** Menu yang boleh dilihat user tertentu; grup kosong dibuang. */
export function getNavFor({ role, isSuperAdmin, canOvertime }: NavViewer): NavGroup[] {
  const isAdmin = role === "ADMIN";
  const inventory = inventoryEnabled({ isSuperAdmin });
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter(
        (item) =>
          (isAdmin || !item.adminOnly) &&
          (!item.approverOnly || canApprove(role)) &&
          (!item.inventory || inventory) &&
          (!item.overtime || canOvertime || isAdmin),
      )
      .map((item) => {
        const children = item.children?.filter(
          (child) => (isAdmin || !child.adminOnly) && (!child.inventory || inventory) && (!child.overtime || canOvertime),
        );
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
