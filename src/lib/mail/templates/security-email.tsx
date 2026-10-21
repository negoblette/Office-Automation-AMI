// Template email keamanan: pemberitahuan ke pemilik akun (hardening Tahap 5: password / MFA diganti, kode cadangan
// dipakai) dan alarm ke semua Admin (Tahap 6: login gagal beruntun, perubahan role, akses data besar-besaran).
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

export type SecurityEmailProps = {
  recipientName: string;
  /** Judul singkat, mis. "Password akun Anda diganti". */
  title: string;
  /** Penjelasan apa yang terjadi. */
  message: string;
  /** Waktu kejadian sudah diformat (WIB). */
  when: string;
  /** IP asal permintaan, bila diketahui. */
  ip: string | null;
  url: string;
  /** "owner" = pemilik akun (default); "admin" = alarm untuk Admin. */
  variant?: "owner" | "admin";
  /** Rincian tambahan (alarm Admin). */
  details?: string[];
};

export function SecurityEmail(props: SecurityEmailProps) {
  const admin = props.variant === "admin";
  return (
    <Html lang="id">
      <Head />
      <Preview>{props.title}</Preview>
      <Body style={{ backgroundColor: "#f6f8fb", fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: 28, maxWidth: 560 }}>
          <Text style={{ color: "#1d5fe0", fontSize: 13, fontWeight: 700, letterSpacing: 1, margin: 0 }}>{admin ? "OFFICE AUTOMATION · ALARM KEAMANAN" : "OFFICE AUTOMATION · KEAMANAN AKUN"}</Text>
          <Heading as="h1" style={{ color: "#0f172a", fontSize: 22, margin: "12px 0 16px" }}>
            {props.title}
          </Heading>
          <Text style={{ color: "#334155", fontSize: 15, margin: "0 0 16px" }}>Halo {props.recipientName},</Text>
          <Text style={{ color: "#334155", fontSize: 14, margin: "0 0 16px" }}>{props.message}</Text>
          <Section style={{ backgroundColor: "#f1f5f9", borderRadius: 10, padding: "12px 16px" }}>
            <Text style={row}>Waktu: {props.when}</Text>
            {props.ip && <Text style={row}>Alamat IP: {props.ip}</Text>}
            {props.details?.map((line) => (
              <Text key={line} style={row}>
                {line}
              </Text>
            ))}
          </Section>
          <Section style={{ backgroundColor: "#fef2f2", borderRadius: 10, marginTop: 16, padding: "12px 16px" }}>
            <Text style={{ ...row, color: "#b91c1c", fontWeight: 600 }}>
              {admin
                ? "Periksa aktivitas ini di audit log. Bila mencurigakan: nonaktifkan akun terkait, reset password & MFA-nya."
                : "Bukan Anda yang melakukannya? Segera hubungi Admin agar password dan MFA akun Anda di-reset."}
            </Text>
          </Section>
          <Button
            href={props.url}
            style={{ backgroundColor: "#0f172a", borderRadius: 8, color: "#ffffff", display: "inline-block", fontSize: 14, fontWeight: 600, marginTop: 20, padding: "12px 20px" }}
          >
            Buka Office Automation
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
