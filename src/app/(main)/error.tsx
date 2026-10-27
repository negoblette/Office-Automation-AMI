"use client";

import { ErrorScreen } from "@/components/shared/error-screen";

/** Error di halaman berlogin — sidebar & topbar tetap tampil, jadi pengguna bisa pindah menu. */
export default function MainError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen {...props} />;
}
