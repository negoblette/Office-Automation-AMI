/** URL absolut ke halaman aplikasi untuk tombol di email. */
export function appUrl(path: string) {
  return new URL(path, process.env.APP_URL ?? "http://localhost:3000").toString();
}
