import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

/** `callbackUrl` dari proxy bisa berupa URL lengkap; ambil path-nya saja (tetap di aplikasi ini). */
function toInternalPath(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  try {
    const url = new URL(value, "http://internal.invalid");
    return `${url.pathname}${url.search}`;
  } catch {
    return undefined;
  }
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Sudah login (dan akun masih aktif) → langsung ke dashboard.
  // Dicek di sini, bukan di proxy, supaya akun nonaktif dengan token lama tidak berputar-putar.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const { callbackUrl } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-sm">
            OA
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Office Automation</h1>
            <p className="text-sm text-muted-foreground">PT Artha Mitra Interdata</p>
          </div>
        </div>

        <div className="rounded-2xl bg-card p-6 shadow-card sm:p-8">
          <div className="mb-6 space-y-1">
            <h2 className="text-lg font-semibold text-foreground">Masuk ke akun Anda</h2>
            <p className="text-sm text-muted-foreground">Gunakan email dan password kantor Anda.</p>
          </div>
          <LoginForm callbackUrl={toInternalPath(callbackUrl)} />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Lupa password? Hubungi Admin untuk reset.
        </p>
      </div>
    </main>
  );
}
