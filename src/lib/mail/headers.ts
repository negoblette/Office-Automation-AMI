// Kebersihan header email (Tahap 16.4, secure coding). Subjek memuat isian user (mis. nama perusahaan peminjam), jadi
// karakter kontrol (CR/LF/TAB/NUL) dibuang supaya tidak bisa menyisipkan header lain (header injection). Alamat penerima
// & balasan harus satu alamat polos — tanpa koma, titik koma, spasi, atau "Nama <alamat>" — supaya satu isian tidak bisa
// menambah penerima lain. Nodemailer juga menyaring, ini lapisan kedua.

const SUBJECT_MAX = 200;

/** Subjek satu baris: karakter kontrol → spasi, spasi berlebih dirapikan, dipotong 200 karakter. */
export function safeSubject(subject: string): string {
  const clean = subject.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > SUBJECT_MAX ? `${clean.slice(0, SUBJECT_MAX - 1)}…` : clean;
}

const SINGLE_ADDRESS = /^[^\s@,;:<>()[\]"\\]{1,64}@[^\s@,;:<>()[\]"\\]{1,253}\.[^\s@,;:<>()[\]"\\]{2,63}$/;

/** Satu alamat email polos (tanpa nama tampilan / daftar alamat). */
export function isSingleAddress(address: string): boolean {
  return address.length <= 254 && SINGLE_ADDRESS.test(address);
}
