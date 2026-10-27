"use client";

import { ErrorScreen } from "@/components/shared/error-screen";

/** Error di luar shell (login, ganti password, MFA, cetak). */
export default function RootError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <ErrorScreen {...props} />
    </main>
  );
}
