// Template email peminjaman unit demo / Product Trial Form (Fase 16) — email internal (Operational & pemohon):
// - loan-approved (2026-11-17): peminjaman disetujui → Operational menyiapkan barang & mencetak form
// - loan-due-soon / loan-overdue (Tahap 16.4, 2026-11-18): pengingat jatuh tempo ke pemohon & Operational
// - loan-extended (Tahap 16.4): perpanjangan disetujui → Operational tahu jatuh tempo baru
// (Pengajuan / keputusan approval memakai template approval-*.) Semua isi teks di-escape React — tidak ada HTML mentah.
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

export type DemoLoanEmailTemplate = "loan-approved" | "loan-due-soon" | "loan-overdue" | "loan-extended";

export type DemoLoanEmailProps = {
  template: DemoLoanEmailTemplate;
  recipientName: string;
  requesterName: string;
  borrowerName: string;
  number: string;
  /** Judul khusus (mis. "Peminjaman unit jatuh tempo besok"); kosong = judul bawaan template. */
  heading?: string;
  /** Kalimat status / langkah berikutnya untuk penerima ini. */
  statusLine: string;
  /** Rincian: periode, PIC, daftar unit. */
  details: string[];
  url: string;
  /** Ke mana balasan email ini terkirim (mis. "Operational (Devi)"); kosong = mohon tidak membalas. */
  replyTo?: string;
};

const HEADINGS: Record<DemoLoanEmailTemplate, string> = {
  "loan-approved": "Peminjaman unit disetujui — siapkan barang & cetak form",
  "loan-due-soon": "Peminjaman unit segera jatuh tempo",
  "loan-overdue": "Peminjaman unit lewat jatuh tempo",
  "loan-extended": "Jatuh tempo peminjaman unit diperpanjang",
};

const ACCENT: Record<DemoLoanEmailTemplate, string> = {
  "loan-approved": "#1d5fe0",
  "loan-due-soon": "#b45309",
  "loan-overdue": "#b91c1c",
  "loan-extended": "#1d5fe0",
};

export function DemoLoanEmail(props: DemoLoanEmailProps) {
  const heading = props.heading ?? HEADINGS[props.template];
  return (
    <Html lang="id">
      <Head />
      <Preview>{`${heading} — ${props.borrowerName} · ${props.number}`}</Preview>
      <Body style={{ backgroundColor: "#f6f8fb", fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: 28, maxWidth: 560 }}>
          <Text style={{ color: ACCENT[props.template], fontSize: 13, fontWeight: 700, letterSpacing: 1, margin: 0 }}>OFFICE AUTOMATION</Text>
          <Heading as="h1" style={{ color: "#0f172a", fontSize: 22, margin: "12px 0 16px" }}>
            {heading}
          </Heading>
          <Text style={{ color: "#334155", fontSize: 15, margin: "0 0 16px" }}>Halo {props.recipientName},</Text>
          <Section style={{ backgroundColor: "#f1f5f9", borderRadius: 10, padding: "12px 16px" }}>
            <Text style={row}>
              <strong>Peminjaman unit</strong> · {props.borrowerName} · {props.number}
            </Text>
            <Text style={row}>Pemohon: {props.requesterName}</Text>
            {props.details.map((line, index) => (
              <Text key={`${index}-${line}`} style={row}>
                {line}
              </Text>
            ))}
          </Section>
          <Text style={{ color: "#0f172a", fontSize: 15, fontWeight: 600, margin: "16px 0 0" }}>{props.statusLine}</Text>
          <Button
            href={props.url}
            style={{ backgroundColor: "#0f172a", borderRadius: 8, color: "#ffffff", display: "inline-block", fontSize: 14, fontWeight: 600, marginTop: 20, padding: "12px 20px" }}
          >
            Buka Peminjaman
          </Button>
          <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0 12px" }} />
          <Text style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>
            Email otomatis dari sistem Office Automation PT Artha Mitra Interdata.{" "}
            {props.replyTo ? `Membalas email ini akan terkirim ke ${props.replyTo}.` : "Mohon tidak membalas email ini."}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const row = { color: "#0f172a", fontSize: 14, margin: "4px 0" };
