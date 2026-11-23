// Email konfirmasi booking ruang meeting (Fase 17, 2026-11-23): dibuat / diubah / dibatalkan, ke pemesan.
// Semua teks di-escape React — tidak ada HTML mentah.
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

export type MeetingBookingSchedule = {
  roomName: string;
  /** "Senin, 24 November 2026". */
  dateLabel: string;
  /** "09:00–10:30 WIB". */
  timeLabel: string;
};

export type MeetingBookingEmailProps = MeetingBookingSchedule & {
  kind: "CREATED" | "UPDATED" | "CANCELLED";
  recipientName: string;
  agenda: string;
  /** Jadwal sebelum diubah (kind UPDATED). */
  previous?: MeetingBookingSchedule;
  /** Nama yang membatalkan bila bukan pemesan sendiri (mis. Admin). */
  cancelledBy?: string | null;
  reason?: string | null;
  url: string;
};

const HEADINGS: Record<MeetingBookingEmailProps["kind"], string> = {
  CREATED: "Booking ruang meeting dikonfirmasi",
  UPDATED: "Booking ruang meeting diubah",
  CANCELLED: "Booking ruang meeting dibatalkan",
};

export function MeetingBookingEmail(props: MeetingBookingEmailProps) {
  const cancelled = props.kind === "CANCELLED";
  return (
    <Html lang="id">
      <Head />
      <Preview>{`${HEADINGS[props.kind]}: ${props.roomName}, ${props.dateLabel} ${props.timeLabel}`}</Preview>
      <Body style={{ backgroundColor: "#f6f8fb", fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: 28, maxWidth: 560 }}>
          <Text style={{ color: "#1d5fe0", fontSize: 13, fontWeight: 700, letterSpacing: 1, margin: 0 }}>OFFICE AUTOMATION</Text>
          <Heading as="h1" style={{ color: "#0f172a", fontSize: 22, margin: "12px 0 16px" }}>
            {HEADINGS[props.kind]}
          </Heading>
          <Text style={paragraph}>Halo {props.recipientName},</Text>
          <Text style={paragraph}>
            {props.kind === "CREATED" && "Booking ruang meeting Anda sudah tersimpan dengan rincian berikut:"}
            {props.kind === "UPDATED" && "Booking ruang meeting Anda sudah diubah. Booking ini tidak bisa diubah lagi; bila perlu, batalkan lalu booking ulang."}
            {cancelled &&
              (props.cancelledBy
                ? `Booking ruang meeting Anda dibatalkan oleh ${props.cancelledBy}. Jam tersebut sekarang bisa dibooking orang lain.`
                : "Booking ruang meeting Anda sudah dibatalkan. Jam tersebut sekarang bisa dibooking orang lain.")}
          </Text>
          <Section style={{ backgroundColor: cancelled ? "#fef2f2" : "#f1f5f9", borderRadius: 10, padding: "12px 16px" }}>
            <Text style={row}>
              <strong>Ruang:</strong> {props.roomName}
            </Text>
            <Text style={row}>
              <strong>Tanggal:</strong> {props.dateLabel}
            </Text>
            <Text style={row}>
              <strong>Jam:</strong> {props.timeLabel}
            </Text>
            <Text style={row}>
              <strong>Agenda:</strong> {props.agenda}
            </Text>
          </Section>
          {props.previous && (
            <Text style={{ ...paragraph, color: "#64748b", fontSize: 13, margin: "12px 0 0" }}>
              Sebelumnya: {props.previous.roomName}, {props.previous.dateLabel}, {props.previous.timeLabel}
            </Text>
          )}
          {cancelled && props.reason && (
            <Text style={{ ...paragraph, margin: "12px 0 0" }}>
              <strong>Alasan pembatalan:</strong> {props.reason}
            </Text>
          )}
          <Button
            href={props.url}
            style={{ backgroundColor: "#0f172a", borderRadius: 8, color: "#ffffff", display: "inline-block", fontSize: 14, fontWeight: 600, marginTop: 20, padding: "12px 20px" }}
          >
            Buka Ruang Meeting
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

const paragraph = { color: "#334155", fontSize: 14, margin: "0 0 12px" };
const row = { color: "#0f172a", fontSize: 14, margin: "4px 0" };
