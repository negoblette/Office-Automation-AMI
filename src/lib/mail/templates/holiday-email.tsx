// Email perubahan Kalender Libur dari sinkronisasi kalender Google (2026-11-18) ke penerima notifikasi (HR & Direktur).
// Semua teks di-escape React — tidak ada HTML mentah.
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

export type HolidayEmailProps = {
  recipientName: string;
  /** "Rab, 10 Mar 2027 — Hari Idul Fitri: ditambahkan". */
  changes: string[];
  /** "LV/2027/03/0004 · Andi Pratama · 9–12 Mar 2027 — hari kerja cuti berkurang 1 …". */
  affected: string[];
  url: string;
};

export function HolidayEmail(props: HolidayEmailProps) {
  return (
    <Html lang="id">
      <Head />
      <Preview>{`Kalender libur diperbarui: ${props.changes.length} perubahan`}</Preview>
      <Body style={{ backgroundColor: "#f6f8fb", fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: 28, maxWidth: 560 }}>
          <Text style={{ color: "#1d5fe0", fontSize: 13, fontWeight: 700, letterSpacing: 1, margin: 0 }}>OFFICE AUTOMATION</Text>
          <Heading as="h1" style={{ color: "#0f172a", fontSize: 22, margin: "12px 0 16px" }}>
            Kalender libur nasional diperbarui
          </Heading>
          <Text style={{ color: "#334155", fontSize: 15, margin: "0 0 12px" }}>Halo {props.recipientName},</Text>
          <Text style={{ color: "#334155", fontSize: 14, margin: "0 0 12px" }}>
            Sinkronisasi dengan kalender libur nasional (Google, mengikuti SKB) mengubah Kalender Libur OA:
          </Text>
          <Section style={{ backgroundColor: "#f1f5f9", borderRadius: 10, padding: "12px 16px" }}>
            {props.changes.map((line, index) => (
              <Text key={`c${index}`} style={row}>
                {line}
              </Text>
            ))}
          </Section>
          {props.affected.length > 0 ? (
            <>
              <Text style={{ color: "#b45309", fontSize: 15, fontWeight: 700, margin: "18px 0 6px" }}>
                {props.affected.length} pengajuan cuti terdampak — mohon cek saldonya
              </Text>
              <Text style={{ color: "#334155", fontSize: 13, margin: "0 0 8px" }}>
                Saldo cuti tidak dikoreksi otomatis. Bila perlu, sesuaikan lewat penyesuaian saldo cuti karyawan.
              </Text>
              <Section style={{ backgroundColor: "#fff7ed", borderRadius: 10, padding: "12px 16px" }}>
                {props.affected.map((line, index) => (
                  <Text key={`a${index}`} style={row}>
                    {line}
                  </Text>
                ))}
              </Section>
            </>
          ) : (
            <Text style={{ color: "#334155", fontSize: 14, margin: "16px 0 0" }}>Tidak ada pengajuan cuti yang terdampak.</Text>
          )}
          <Button
            href={props.url}
            style={{ backgroundColor: "#0f172a", borderRadius: 8, color: "#ffffff", display: "inline-block", fontSize: 14, fontWeight: 600, marginTop: 20, padding: "12px 20px" }}
          >
            Buka Kalender Libur
          </Button>
          <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0 12px" }} />
          <Text style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>
            Email otomatis dari sistem Office Automation PT Artha Mitra Interdata. Mohon tidak membalas email ini.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const row = { color: "#0f172a", fontSize: 14, margin: "4px 0" };
