// Data & fungsi seed — dipakai prisma/seed.ts dan test (src/test/seed.ts). Idempoten: aman dijalankan berulang.
//
// Dua jenis seed (2026-10-29):
//   - `seedAll` (dev & test): data CONTOH — divisi, 8 orang (email @artha-mitra.local, tanggal masuk dummy), master
//     data, alur approval. Tidak pernah dipakai di produksi.
//   - `seedProduction` (SEED_MODE=production): hanya 1 akun Admin sistem + aturan jatah cuti. Divisi, master data,
//     karyawan, dan alur approval diisi Admin dengan data aktual lewat aplikasi (docs/07-DEPLOYMENT.md §6.4).
//
// Karyawan hanya dibuat dengan data minimal yang diisi Admin (nama, email, divisi, jabatan, tanggal masuk, role).
// NIK, KK, NPWP, alamat, keluarga & dokumen diisi staf sendiri lewat aplikasi — jangan diisi di sini.
import type {
  PrismaClient,
  ApprovalModule,
  FlowScope,
  Prisma,
  Role,
} from "../src/generated/prisma/client";


export const EMAIL_DOMAIN = "artha-mitra.local";

/** Kode divisi (master `Division`, 2026-10-12). */
type Division = string;

// Divisi bawaan; HR & Finance mengikuti alur approval Umum (keputusan user 2026-10-12).
export const DIVISIONS = [
  { code: "UMUM", name: "Umum", followsCode: null, sortOrder: 1 },
  { code: "ENGINEER", name: "Engineer", followsCode: null, sortOrder: 2 },
  { code: "SALES", name: "Sales", followsCode: null, sortOrder: 3 },
  { code: "DIRECTOR", name: "Direktur", followsCode: null, sortOrder: 4 },
  { code: "HR", name: "HR", followsCode: "UMUM", sortOrder: 5 },
  { code: "FINANCE", name: "Finance", followsCode: "UMUM", sortOrder: 6 },
];

export async function seedDivisions(prisma: PrismaClient) {
  for (const division of DIVISIONS) {
    await prisma.division.upsert({ where: { code: division.code }, create: division, update: {} });
  }
}

export type SeedPerson = {
  key: string; // dipakai untuk referensi antar-seed (mis. approver flow)
  fullName: string;
  division: Division;
  position: string;
  role: Role;
  startDate: string; // YYYY-MM-DD
};

export const PEOPLE: SeedPerson[] = [
  // Admin
  { key: "yosep", fullName: "Yosep", division: "ENGINEER", position: "Kepala Divisi Engineer", role: "APPROVER", startDate: "2015-01-05" },
  { key: "rudy", fullName: "Rudy", division: "DIRECTOR", position: "Direktur", role: "ADMIN", startDate: "2010-01-04" },
  { key: "darwin", fullName: "Darwin", division: "SALES", position: "Kepala Divisi Sales", role: "APPROVER", startDate: "2016-03-01" },
  { key: "leonard", fullName: "Leonard", division: "DIRECTOR", position: "Direktur", role: "ADMIN", startDate: "2010-01-04" },
  { key: "ika", fullName: "Ika", division: "UMUM", position: "HR & Finance", role: "ADMIN", startDate: "2018-07-02" },
  // Staf contoh per divisi
  { key: "andi", fullName: "Andi Pratama", division: "ENGINEER", position: "Engineer", role: "STAFF", startDate: "2021-02-01" },
  { key: "sinta", fullName: "Sinta Lestari", division: "SALES", position: "Account Manager", role: "STAFF", startDate: "2023-06-12" },
  { key: "devi", fullName: "Devi", division: "UMUM", position: "Staf Umum", role: "STAFF", startDate: "2019-09-02" },
];

export function emailOf(person: SeedPerson) {
  return `${person.key}@${EMAIL_DOMAIN}`;
}

export async function seedPeople(prisma: PrismaClient, passwordHash: string) {
  const userIds: Record<string, string> = {};

  for (const person of PEOPLE) {
    const email = emailOf(person);
    const employeeData = {
      fullName: person.fullName,
      email,
      division: person.division,
      position: person.position,
    };

    // Update hanya menyentuh field milik Admin, supaya data yang sudah diisi staf tidak tertimpa.
    const employee = await prisma.employee.upsert({
      where: { email },
      create: employeeData,
      update: employeeData,
    });

    // EmploymentPeriod tidak punya kunci unik: buat hanya jika belum ada periode.
    const hasPeriod = await prisma.employmentPeriod.count({ where: { employeeId: employee.id } });
    if (!hasPeriod) {
      await prisma.employmentPeriod.create({
        data: { employeeId: employee.id, startDate: new Date(person.startDate) },
      });
    }

    // Password tidak ditimpa saat seed diulang, supaya password yang sudah diganti tetap berlaku.
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash, role: person.role, employeeId: employee.id },
      update: { role: person.role, employeeId: employee.id },
    });
    userIds[person.key] = user.id;
  }

  console.log(`✔ ${PEOPLE.length} karyawan & user`);
  return userIds;
}

// Master data di bawah bisa diubah Admin lewat Setting, jadi seed hanya membuat
// yang belum ada dan tidak pernah menimpa perubahan Admin.

// URD LV-02: masa kerja (tahun penuh) per 1 Januari — 0 = 0 hari; 1–4 = 12; 5–14 = 15; ≥15 = 18
// (per 1 Jan masa kerja ≥5 / ≥15 th penuh dianggap sudah >5 / >15 th, keputusan user 2026-10-02).
const LEAVE_POLICIES = [
  { minYears: 0, maxYears: 0, days: 0 },
  { minYears: 1, maxYears: 4, days: 12 },
  { minYears: 5, maxYears: 14, days: 15 },
  { minYears: 15, maxYears: null, days: 18 },
];

const APP_SETTINGS: Record<string, Prisma.InputJsonValue> = {
  "leave.maxCarryOver": 3, // URD LV-03
};

// v1.14: 6 tipe bebas dipilih semua divisi. Parkir -> Allowance; bensin & tol -> Transport.
const ALL_DIVISIONS: Division[] = DIVISIONS.map((d) => d.code);
const REIMBURSE_TYPES = [
  { code: "ENTERTAINMENT", name: "Entertainment", divisions: ALL_DIVISIONS },
  { code: "MEALS", name: "Meals", divisions: ALL_DIVISIONS },
  { code: "GIFT", name: "Gift", divisions: ALL_DIVISIONS },
  { code: "ACCOMMODATION", name: "Accommodation", divisions: ALL_DIVISIONS },
  { code: "TRANSPORT", name: "Transport", divisions: ALL_DIVISIONS },
  { code: "ALLOWANCE", name: "Allowance", divisions: ALL_DIVISIONS },
];

// URD HC-02
// Urutan = urutan di dropdown (sortOrder). Obat-obatan: 2026-10-16.
const HEALTH_CATEGORIES = ["Rawat Jalan Dokter", "Obat-obatan", "Vitamin", "Kacamata"];

/** Aturan jatah cuti (URD LV-02) & carry-over (LV-03) — dipakai seed dev maupun produksi. */
async function seedLeaveRules(prisma: PrismaClient) {
  // LeavePolicy tidak punya kunci unik: isi hanya jika tabel masih kosong.
  if ((await prisma.leavePolicy.count()) === 0) {
    await prisma.leavePolicy.createMany({ data: LEAVE_POLICIES });
  }

  for (const [key, value] of Object.entries(APP_SETTINGS)) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
}

export async function seedMasterData(prisma: PrismaClient) {
  await seedLeaveRules(prisma);

  for (const type of REIMBURSE_TYPES) {
    await prisma.reimburseType.upsert({ where: { code: type.code }, create: type, update: {} });
  }

  for (const [i, name] of HEALTH_CATEGORIES.entries()) {
    await prisma.healthCategory.upsert({ where: { name }, create: { name, sortOrder: (i + 1) * 10 }, update: {} });
  }

  console.log(
    `✔ master data: ${LEAVE_POLICIES.length} jatah cuti, ${Object.keys(APP_SETTINGS).length} setting, ` +
      `${REIMBURSE_TYPES.length} tipe reimburse, ${HEALTH_CATEGORIES.length} kategori kesehatan`,
  );
}

// Matriks persetujuan v1.14. Tiap step = daftar key orang dari PEOPLE; lebih dari satu = salah
// satu cukup. `steps: []` = tanpa approval. `autoApproveWhenSkipped` = pemohon adalah approver
// satu-satunya (mis. Bu Ika) -> langsung disetujui, bukan ke Fallback.
type SeedFlow = {
  scope: FlowScope;
  module: ApprovalModule | null;
  division: Division | null; // null = semua divisi
  steps: string[][];
  autoApproveWhenSkipped?: boolean;
};

// Reimburse; Expense project sama dengan reimburse.
const REGULAR_MODULES: ApprovalModule[] = ["REIMBURSE", "EXPENSE"];
// HR & Finance tidak punya alur sendiri: mengikuti Umum lewat `Division.followsCode`.
const DIVISION_STEPS: Record<string, string[][]> = {
  // Fase 14 (2026-10-02): Sales satu level (salah satu cukup); Umum Bu Ika / Ko Leonard.
  SALES: [["darwin", "leonard"]],
  ENGINEER: [["yosep"], ["rudy"]],
  UMUM: [["ika", "leonard"]],
  DIRECTOR: [["ika"]],
};

export const APPROVAL_FLOWS: SeedFlow[] = [
  ...REGULAR_MODULES.flatMap((module) =>
    Object.entries(DIVISION_STEPS).map(([division, steps]) => ({
      scope: "REGULAR" as const,
      module,
      division: division as Division,
      steps,
      // Pemohon dikeluarkan dari levelnya sendiri (Ika → Leonard, Darwin → Leonard), jadi tidak
      // perlu auto-approve (keputusan user 2026-10-02).
      autoApproveWhenSkipped: false,
    })),
  ),
  // Cuti: semua divisi -> Ko Rudy; divisi Direktur tanpa approval (BR-CUT-11).
  { scope: "REGULAR", module: "LEAVE", division: null, steps: [["rudy"]] },
  { scope: "REGULAR", module: "LEAVE", division: "DIRECTOR", steps: [] },
  // Verifikasi sertifikat: Ko Yosep -> Bu Ika (Fase 14, 2026-10-05).
  // Verifikasi sertifikat -> Ci Ika saja (2026-10-12; sebelumnya Ko Yosep -> Bu Ika); milik Ci Ika -> Fallback.
  { scope: "REGULAR", module: "CERTIFICATE", division: null, steps: [["ika"]] },
  // Appeal absensi (sakit / kunjungan keluar) -> Bu Ika; appeal Bu Ika -> Fallback (Fase 14).
  { scope: "REGULAR", module: "ATTENDANCE_APPEAL", division: null, steps: [["ika"]] },
  // Klaim kesehatan -> Bu Ika; klaim Bu Ika sendiri -> Fallback.
  { scope: "REGULAR", module: "HEALTH", division: null, steps: [["ika"]] },
  { scope: "FALLBACK", module: null, division: null, steps: [["rudy", "leonard"]] },
];

export async function seedApprovalFlows(prisma: PrismaClient, userIds: Record<string, string>) {
  let created = 0;

  for (const flow of APPROVAL_FLOWS) {
    // ApprovalFlow tidak punya kunci unik: cari berdasarkan scope + module + division.
    const existing = await prisma.approvalFlow.findFirst({
      where: { scope: flow.scope, module: flow.module, division: flow.division },
    });
    if (existing) continue;

    await prisma.approvalFlow.create({
      data: {
        scope: flow.scope,
        module: flow.module,
        division: flow.division,
        autoApproveWhenSkipped: flow.autoApproveWhenSkipped ?? false,
        steps: {
          create: flow.steps.map((approverKeys, index) => ({
            level: index + 1,
            approvers: {
              create: approverKeys.map((key) => ({ userId: userIds[key] })),
            },
          })),
        },
      },
    });
    created++;
  }

  console.log(`✔ approval flow: ${APPROVAL_FLOWS.length} flow (${created} baru)`);
}

/** Seed dev & test (data contoh). Mengembalikan id user per key (mis. "rudy"). */
export async function seedAll(prisma: PrismaClient, passwordHash: string, { log = true } = {}) {
  const original = console.log;
  if (!log) console.log = () => undefined;
  try {
    await seedDivisions(prisma);
    const userIds = await seedPeople(prisma, passwordHash);
    await seedMasterData(prisma);
    await seedApprovalFlows(prisma, userIds);
    return userIds;
  } finally {
    console.log = original;
  }
}

/**
 * Seed produksi (2026-10-29): akun Admin sistem tanpa data karyawan + aturan jatah cuti. Email-nya khusus akun sistem
 * (bukan email karyawan, karena email karyawan dipakai lagi saat Admin membuat data karyawannya). Password awal wajib
 * diganti & MFA wajib saat login pertama. Akun ini bisa dinonaktifkan setelah Admin sungguhan dibuat.
 */
export async function seedProduction(prisma: PrismaClient, passwordHash: string, adminEmail: string) {
  await seedLeaveRules(prisma);
  const email = adminEmail.trim().toLowerCase();
  // Password & status tidak ditimpa saat seed diulang. Akun Admin sistem = super admin (2026-10-30).
  await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, role: "ADMIN", mustChangePassword: true, isSuperAdmin: true },
    update: { isSuperAdmin: true },
  });
  console.log(`✔ aturan cuti: ${LEAVE_POLICIES.length} jatah, ${Object.keys(APP_SETTINGS).length} setting`);
  console.log(`✔ akun Admin sistem: ${email}`);
}
