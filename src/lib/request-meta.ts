// IP & user agent dari header request — untuk audit log dan rate limit login (hardening 2026-10).
// PENTING: header ini hanya bisa dipercaya bila aplikasi berada di belakang reverse proxy yang
// MENIMPA (bukan menambah) X-Real-IP / X-Forwarded-For dari client. Tanpa proxy, penyerang bisa
// memalsukannya; batas per email (login-throttle) tetap berlaku sebagai pengaman.
export type RequestMeta = { ip: string | null; userAgent: string | null };

export function requestMeta(headers: Pick<Headers, "get">): RequestMeta {
  const realIp = headers.get("x-real-ip")?.trim();
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: (realIp || forwarded || null)?.slice(0, 64) ?? null,
    userAgent: headers.get("user-agent")?.slice(0, 300) ?? null,
  };
}
