"use client";

import { ErrorScreen } from "@/components/shared/error-screen";
import "./globals.css";

/** Error di root layout sendiri (jarang): menggantikan seluruh dokumen, jadi wajib punya <html> & <body>. */
export default function GlobalError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background">
        <title>Terjadi gangguan · Office Automation</title>
        <main className="flex flex-1 flex-col">
          <ErrorScreen {...props} />
        </main>
      </body>
    </html>
  );
}
