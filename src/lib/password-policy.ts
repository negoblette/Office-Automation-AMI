// Kebijakan password (hardening 2026-10) — NIST SP 800-63B-4 & OWASP Authentication Cheat Sheet:
// cukup panjang minimal (tanpa aturan "wajib huruf besar/angka/simbol"), lalu tolak pola dan kata
// yang mudah ditebak serta data pribadi. Fungsi murni: dipakai schema Zod (client & server) dan service.

/** NIST SP 800-63B-4: password sebagai satu-satunya faktor minimal 15 karakter. */
export const PASSWORD_MIN_LENGTH = 15;
/** NIST: izinkan minimal 64; 128 cukup dan membatasi beban argon2. */
export const PASSWORD_MAX_LENGTH = 128;

/** Kata dasar yang paling sering dipakai (dibandingkan setelah angka, simbol & spasi dibuang). */
const COMMON_WORDS = new Set([
  "password", "passwords", "admin", "administrator", "qwerty", "welcome", "letmein", "iloveyou",
  "rahasia", "sayang", "bismillah", "indonesia", "jakarta", "bandung", "surabaya", "merdeka",
  "artha", "mitra", "arthamitra", "interdata", "arthamitrainterdata", "office", "officeautomation",
  "karyawan", "kantor", "default", "changeme", "gantipassword", "test", "testing", "user", "login",
]);

/** Deret yang sering diketik berurutan (dicek maju dan mundur). */
const SEQUENCES = [
  "0123456789".repeat(4),
  "abcdefghijklmnopqrstuvwxyz".repeat(2),
  "qwertyuiopasdfghjklzxcvbnm".repeat(2),
  "1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik9ol0p",
];
const REVERSED = SEQUENCES.map((seq) => [...seq].reverse().join(""));

/**
 * Masalah pada password, atau null bila boleh dipakai. `personal` = data pemilik akun
 * (bagian depan email, nama lengkap) yang tidak boleh ada di dalam password.
 */
export function passwordProblem(password: string, personal: string[] = []): string | null {
  const lower = password.toLowerCase();
  if (/^(.)\1+$/u.test(password)) return "Password tidak boleh berupa satu karakter yang diulang";
  if ([...SEQUENCES, ...REVERSED].some((seq) => seq.includes(lower))) {
    return "Password tidak boleh berupa deret berurutan (mis. 123456… atau qwerty…)";
  }

  const letters = lower.replace(/[^\p{L}]/gu, "");
  if (COMMON_WORDS.has(letters)) {
    return "Password terlalu umum. Gunakan kalimat atau gabungan kata yang tidak mudah ditebak";
  }

  const tokens = personal.flatMap((value) => value.toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter((token) => token.length >= 4);
  if (tokens.some((token) => lower.includes(token) || letters.includes(token))) {
    return "Password tidak boleh memuat nama atau email Anda";
  }
  return null;
}
