// Data & fungsi seed — dipakai prisma/seed.ts dan test approval (src/test/seed.ts).
// Idempoten: aman dijalankan berulang.
//
// Karyawan hanya dibuat dengan data minimal yang diisi Admin (nama, email, divisi,
// jabatan, tanggal masuk, role). NIK, KK, NPWP, alamat, keluarga & dokumen diisi
// staf sendiri lewat aplikasi — jangan diisi di sini.
// Email & tanggal masuk di bawah masih DUMMY untuk development.
import type {
  PrismaClient,
  ApprovalModule,
  Division,
  FlowScope,
  Prisma,
  Role,
} from "../src/generated/prisma/client";


export const EMAIL_DOMAIN = "artha-mitra.local";

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
const ALL_DIVISIONS: Division[] = ["SALES", "ENGINEER", "UMUM", "DIRECTOR"];
const REIMBURSE_TYPES = [
  { code: "ENTERTAINMENT", name: "Entertainment", divisions: ALL_DIVISIONS },
  { code: "MEALS", name: "Meals", divisions: ALL_DIVISIONS },
  { code: "GIFT", name: "Gift", divisions: ALL_DIVISIONS },
  { code: "ACCOMMODATION", name: "Accommodation", divisions: ALL_DIVISIONS },
  { code: "TRANSPORT", name: "Transport", divisions: ALL_DIVISIONS },
  { code: "ALLOWANCE", name: "Allowance", divisions: ALL_DIVISIONS },
];

// URD HC-02
const HEALTH_CATEGORIES = ["Rawat Jalan Dokter", "Vitamin", "Kacamata"];

export async function seedMasterData(prisma: PrismaClient) {
  // LeavePolicy tidak punya kunci unik: isi hanya jika tabel masih kosong.
  if ((await prisma.leavePolicy.count()) === 0) {
    await prisma.leavePolicy.createMany({ data: LEAVE_POLICIES });
  }

  for (const [key, value] of Object.entries(APP_SETTINGS)) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }

  for (const type of REIMBURSE_TYPES) {
    await prisma.reimburseType.upsert({ where: { code: type.code }, create: type, update: {} });
  }

  for (const name of HEALTH_CATEGORIES) {
    await prisma.healthCategory.upsert({ where: { name }, create: { name }, update: {} });
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

// Reimburse; Expense & Revenue project sama dengan reimburse.
const REGULAR_MODULES: ApprovalModule[] = ["REIMBURSE", "EXPENSE", "REVENUE"];
const DIVISION_STEPS: Record<Division, string[][]> = {
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
  { scope: "REGULAR", module: "CERTIFICATE", division: null, steps: [["yosep"], ["ika"]] },
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

/** Jalankan semua seed. Mengembalikan id user per key (mis. "rudy"). */
export async function seedAll(prisma: PrismaClient, passwordHash: string, { log = true } = {}) {
  const original = console.log;
  if (!log) console.log = () => undefined;
  try {
    const userIds = await seedPeople(prisma, passwordHash);
    await seedMasterData(prisma);
    await seedApprovalFlows(prisma, userIds);
    return userIds;
  } finally {
    console.log = original;
  }
}
