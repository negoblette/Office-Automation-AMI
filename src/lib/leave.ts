// Perhitungan cuti murni (tanpa database) — URD LV-01..08, Tech Spec §6.2.
// Semua tanggal berupa string kalender `YYYY-MM-DD` (zona Asia/Jakarta sudah diterapkan pemanggil).
// Periode cuti = tahun kalender; cuti mulai bisa dipakai setelah genap 1 tahun masa kerja.

const DAY_MS = 24 * 60 * 60 * 1000;

function parse(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function toIso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Tanggal ulang tahun di tahun tertentu; 29 Feb di tahun non-kabisat → 28 Feb. */
function anniversary(startIso: string, year: number): string {
  const { m, d } = parse(startIso);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return toIso(year, m, Math.min(d, lastDay));
}

/** Masa kerja dalam tahun penuh dari `startIso` sampai `refIso` (Tech Spec §6.2). */
export function fullYearsOfService(startIso: string, refIso: string): number {
  if (refIso < startIso) return 0;
  const start = parse(startIso);
  const ref = parse(refIso);
  const years = ref.y - start.y;
  return refIso >= anniversary(startIso, ref.y) ? years : years - 1;
}

export type LeavePolicyRow = { minYears: number; maxYears: number | null; days: number };

/** Jatah dari LeavePolicy dengan minYears ≤ masa kerja ≤ maxYears (null = tanpa batas atas). */
export function entitlementFor(years: number, policies: LeavePolicyRow[]): number {
  const policy = policies.find((p) => years >= p.minYears && (p.maxYears === null || years <= p.maxYears));
  return policy?.days ?? 0;
}

/** Tanggal genap 1 tahun masa kerja. */
export function firstAnniversary(startIso: string): string {
  return anniversary(startIso, parse(startIso).y + 1);
}

/**
 * Jumlah bulan jatah di tahun genap 1 tahun (keputusan user 2026-09-25): 12 − bulan genap 1 tahun,
 * bulan itu sendiri tidak dihitung. Masuk Jan → 11, Feb → 10, …, Des → 0 (baru dapat Januari berikutnya).
 */
export function firstYearMonths(startIso: string): number {
  return 12 - parse(firstAnniversary(startIso)).m;
}

/** Tanggal pertama cuti benar-benar bisa dipakai: genap 1 tahun, atau 1 Januari berikutnya bila jatahnya 0. */
export function firstUsableDate(startIso: string): string {
  const anniversaryIso = firstAnniversary(startIso);
  return firstYearMonths(startIso) > 0 ? anniversaryIso : toIso(parse(anniversaryIso).y + 1, 1, 1);
}

export type LeaveYear = {
  /** Awal periode: 1 Januari, atau tanggal masuk bila masuk di tahun itu (periode kerja baru). */
  start: string;
  /** Akhir periode: 31 Desember (cutoff pemakaian). */
  end: string;
  /** Tanggal mulai boleh cuti di periode ini; null = tidak ada jatah di tahun ini. */
  eligibleFrom: string | null;
  /** Masa kerja (tahun penuh) yang dipakai untuk menentukan jatah. */
  serviceYears: number;
  /** Bulan jatah di tahun ini: 12, atau 12 − bulan genap 1 tahun di tahun pertama. */
  prorateMonths: number;
};

/**
 * Periode cuti = TAHUN KALENDER (keputusan user 2026-09-24, menjawab OI-03; diubah 2026-09-25):
 * - cuti baru bisa dipakai setelah genap 1 tahun masa kerja;
 * - di tahun kalender saat genap 1 tahun, jatah prorata 1 hari per bulan tersisa (bulan genap
 *   1 tahun tidak dihitung): masuk Feb 2026 → Feb 2027 dapat 10 hari; masuk Des → 0 (cutoff);
 * - tahun berikutnya jatah penuh menurut masa kerja per 1 Januari (naik tingkat mulai Januari);
 * - rehire: `startIso` = tanggal masuk periode kerja terbaru, jadi hitungan mulai dari nol lagi.
 */
export function leaveYear(startIso: string, refIso: string): LeaveYear {
  const year = parse(refIso).y;
  const jan1 = toIso(year, 1, 1);
  const dec31 = toIso(year, 12, 31);
  const start = startIso > jan1 ? startIso : jan1;
  const eligibility = firstAnniversary(startIso);

  if (eligibility > dec31) return { start, end: dec31, eligibleFrom: null, serviceYears: 0, prorateMonths: 0 };
  const firstYear = eligibility >= jan1;
  const prorateMonths = firstYear ? firstYearMonths(startIso) : 12;
  return {
    start,
    end: dec31,
    eligibleFrom: prorateMonths === 0 ? null : eligibility > start ? eligibility : start,
    serviceYears: Math.max(1, fullYearsOfService(startIso, jan1)),
    prorateMonths,
  };
}

/** Jatah hari di periode ini: jatah LeavePolicy × bulan jatah / 12 (dibulatkan ke bawah). */
export function yearEntitlement(year: LeaveYear, policies: LeavePolicyRow[]): number {
  if (year.prorateMonths === 0) return 0;
  return Math.floor((entitlementFor(year.serviceYears, policies) * year.prorateMonths) / 12);
}

/** Jumlah hari kerja (Senin–Jumat, bukan hari libur) dalam rentang inklusif (LV-05). */
export function countWorkingDays(startIso: string, endIso: string, holidays: ReadonlySet<string>): number {
  let count = 0;
  for (let day = startIso; day <= endIso; day = addDays(day, 1)) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays.has(day)) count++;
  }
  return count;
}

export type BalanceNumbers = {
  entitlement: number;
  carriedOver: number;
  used: number;
  /** Penyesuaian Admin / potong cuti tidak hadir (Fase 14); boleh negatif. */
  adjustment?: number;
};

/** Sisa saldo = jatah + carry over + penyesuaian − terpakai − pengajuan lain yang masih menunggu (LV-07/08). */
export function remainingDays(balance: BalanceNumbers, pendingDays = 0): number {
  return balance.entitlement + balance.carriedOver + (balance.adjustment ?? 0) - balance.used - pendingDays;
}

/**
 * Carry over untuk tahun berikutnya (keputusan user 2026-09-24, OI-02): berlaku sepanjang tahun
 * berikutnya lalu hangus 31 Des. Carry over (positif) dipakai lebih dulu, jadi yang tersisa dari
 * periode ini dihitung dari jatah + penyesuaian saja; sisa carry over lama hangus. Maks `maxCarryOver` (LV-03).
 * Saldo minus (mis. potong cuti karena tidak hadir, Fase 14) terbawa penuh dan mengurangi jatah berikutnya.
 */
export function nextCarryOver(balance: BalanceNumbers, maxCarryOver: number): number {
  const adjustment = balance.adjustment ?? 0;
  const leftover =
    balance.carriedOver > 0
      ? balance.entitlement + adjustment - Math.max(0, balance.used - balance.carriedOver)
      : balance.entitlement + balance.carriedOver + adjustment - balance.used;
  return leftover < 0 ? leftover : Math.min(leftover, maxCarryOver);
}
