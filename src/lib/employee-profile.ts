// Kelengkapan data diri yang diisi staf sendiri (EMP-06). Kelengkapan dokumen (DOC-03) menyusul di Tahap 4.4.

/** Field data diri yang wajib dilengkapi staf, dengan label untuk ditampilkan. */
export const PROFILE_FIELDS = {
  nik: "NIK",
  kkNo: "Nomor KK",
  birthPlace: "Tempat lahir",
  birthDate: "Tanggal lahir",
  gender: "Jenis kelamin",
  address: "Alamat",
  phone: "Nomor HP",
  npwp: "NPWP",
  bpjsTkNo: "BPJS Ketenagakerjaan",
  bpjsKesNo: "BPJS Kesehatan",
} as const;

export type ProfileFieldKey = keyof typeof PROFILE_FIELDS;

export type ProfileCompleteness = {
  filled: number;
  total: number;
  percent: number;
  /** Label field yang masih kosong. */
  missing: string[];
};

export function profileCompleteness(employee: Partial<Record<ProfileFieldKey, unknown>>): ProfileCompleteness {
  const keys = Object.keys(PROFILE_FIELDS) as ProfileFieldKey[];
  const missing = keys.filter((key) => {
    const value = employee[key];
    return value === null || value === undefined || value === "";
  });
  const filled = keys.length - missing.length;
  return {
    filled,
    total: keys.length,
    percent: Math.round((filled / keys.length) * 100),
    missing: missing.map((key) => PROFILE_FIELDS[key]),
  };
}
