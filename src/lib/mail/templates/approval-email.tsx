// Template email approval (Tech Spec §7): approval-requested / approval-progress / approval-final.
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

export type ApprovalEmailProps = {
  template: "approval-requested" | "approval-progress" | "approval-final";
  recipientName: string;
  requesterName: string;
  moduleLabel: string;
  entityNumber: string;
  /** Kalimat status, mis. "Disetujui L1 oleh Yosep, menunggu persetujuan L2." */
  statusLine: string;
  url: string;
};

const HEADINGS: Record<ApprovalEmailProps["template"], string> = {
  "approval-requested": "Pengajuan menunggu persetujuan Anda",
  "approval-progress": "Pengajuan Anda sedang diproses",
  "approval-final": "Pengajuan telah disetujui",
};

const BUTTONS: Record<ApprovalEmailProps["template"], string> = {
  "approval-requested": "Buka Antrian Approval",
  "approval-progress": "Lihat Pengajuan",
  "approval-final": "Lihat Pengajuan",
};

export function ApprovalEmail(props: ApprovalEmailProps) {
  const heading = HEADINGS[props.template];
  return (
    <Html lang="id">
      <Head />
      <Preview>{`${props.moduleLabel} ${props.entityNumber} — ${heading}`}</Preview>
      <Body style={{ backgroundColor: "#f6f8fb", fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: 28, maxWidth: 560 }}>
          <Text style={{ color: "#1d5fe0", fontSize: 13, fontWeight: 700, letterSpacing: 1, margin: 0 }}>OFFICE AUTOMATION</Text>
          <Heading as="h1" style={{ color: "#0f172a", fontSize: 22, margin: "12px 0 16px" }}>
            {heading}
          </Heading>
          <Text style={{ color: "#334155", fontSize: 15, margin: "0 0 16px" }}>Halo {props.recipientName},</Text>
          <Section style={{ backgroundColor: "#f1f5f9", borderRadius: 10, padding: "12px 16px" }}>
            <Text style={row}>
              <strong>{props.moduleLabel}</strong> · {props.entityNumber}
            </Text>
            <Text style={row}>Pemohon: {props.requesterName}</Text>
            <Text style={row}>{props.statusLine}</Text>
          </Section>
          <Button
            href={props.url}
            style={{ backgroundColor: "#0f172a", borderRadius: 8, color: "#ffffff", display: "inline-block", fontSize: 14, fontWeight: 600, marginTop: 20, padding: "12px 20px" }}
          >
            {BUTTONS[props.template]}
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
