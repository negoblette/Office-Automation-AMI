// Template email reminder H-30 (Tech Spec §7): sertifikat, support & garansi unit.
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

export type ReminderEmailProps = {
  recipientName: string;
  /** mis. "Sertifikat", "Periode support unit", "Garansi unit". */
  itemKind: string;
  itemName: string;
  /** Baris keterangan, mis. "Pemilik: Andi Pratama" atau "Serial: ABC123". */
  detailLine: string;
  /** Tanggal berakhir sudah diformat, mis. "24 Oktober 2026". */
  dueDate: string;
  daysLeft: number;
  url: string;
};

export function ReminderEmail(props: ReminderEmailProps) {
  const when = props.daysLeft === 0 ? "hari ini" : `${props.daysLeft} hari lagi`;
  const heading = `${props.itemKind} berakhir ${when}`;
  return (
    <Html lang="id">
      <Head />
      <Preview>{`${heading}: ${props.itemName}`}</Preview>
      <Body style={{ backgroundColor: "#f6f8fb", fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: 28, maxWidth: 560 }}>
          <Text style={{ color: "#1d5fe0", fontSize: 13, fontWeight: 700, letterSpacing: 1, margin: 0 }}>OFFICE AUTOMATION</Text>
          <Heading as="h1" style={{ color: "#0f172a", fontSize: 22, margin: "12px 0 16px" }}>
            {heading}
          </Heading>
          <Text style={{ color: "#334155", fontSize: 15, margin: "0 0 16px" }}>Halo {props.recipientName},</Text>
          <Section style={{ backgroundColor: "#fff7ed", borderRadius: 10, padding: "12px 16px" }}>
            <Text style={row}>
              <strong>{props.itemKind}</strong> · {props.itemName}
            </Text>
            <Text style={row}>{props.detailLine}</Text>
            <Text style={row}>Berakhir: {props.dueDate}</Text>
          </Section>
          <Text style={{ color: "#334155", fontSize: 14, margin: "16px 0 0" }}>Mohon segera diperpanjang atau diperbarui datanya.</Text>
          <Button
            href={props.url}
            style={{ backgroundColor: "#0f172a", borderRadius: 8, color: "#ffffff", display: "inline-block", fontSize: 14, fontWeight: 600, marginTop: 20, padding: "12px 20px" }}
          >
            Lihat Detail
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
