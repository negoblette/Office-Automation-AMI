import type { Metadata } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { connection } from "next/server";
import { FeedbackProvider } from "@/components/shared/feedback";
import "./globals.css";

// Font tampilan baru (docs/design/prototipe-dashboard-oa.html): Plus Jakarta Sans untuk antarmuka,
// IBM Plex Mono untuk jam dan nomor dokumen.
const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta-sans",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Office Automation — PT Artha Mitra Interdata",
    template: "%s · Office Automation",
  },
  description: "Sistem administrasi kantor internal PT Artha Mitra Interdata",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // CSP nonce (hardening Tahap 3) hanya bisa dipasang saat render per request → semua halaman dinamis,
  // termasuk halaman 404 bawaan.
  await connection();
  return (
    <html
      lang="id"
      className={`${jakartaSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Dialog konfirmasi & notifikasi aplikasi (useFeedback) — audit UI 2026-10-27. */}
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
