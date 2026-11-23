// Render template email → HTML + teks polos. Dipakai worker (bukan request web).
import { render } from "@react-email/components";
import type { ReactElement } from "react";
import { ApprovalEmail, type ApprovalEmailProps } from "./templates/approval-email";
import { DemoLoanEmail, type DemoLoanEmailProps } from "./templates/demo-loan-email";
import { HolidayEmail, type HolidayEmailProps } from "./templates/holiday-email";
import { MeetingBookingEmail, type MeetingBookingEmailProps } from "./templates/meeting-booking-email";
import { ReminderEmail, type ReminderEmailProps } from "./templates/reminder-email";
import { SecurityEmail, type SecurityEmailProps } from "./templates/security-email";

/** Semua template yang bisa di-enqueue beserta props-nya. */
export type EmailTemplates = {
  "approval-requested": ApprovalEmailProps;
  "approval-progress": ApprovalEmailProps;
  "approval-final": ApprovalEmailProps;
  "approval-rejected": ApprovalEmailProps;
  "reminder-expiry": ReminderEmailProps;
  "security-notice": SecurityEmailProps;
  "security-alert": SecurityEmailProps;
  "loan-approved": DemoLoanEmailProps;
  "loan-due-soon": DemoLoanEmailProps;
  "loan-overdue": DemoLoanEmailProps;
  "loan-extended": DemoLoanEmailProps;
  "loan-follow-up": DemoLoanEmailProps;
  "holiday-change": HolidayEmailProps;
  "meeting-booked": MeetingBookingEmailProps;
  "meeting-updated": MeetingBookingEmailProps;
  "meeting-cancelled": MeetingBookingEmailProps;
};

export type EmailTemplateName = keyof EmailTemplates;

const LOAN_TEMPLATES = new Set<EmailTemplateName>(["loan-approved", "loan-due-soon", "loan-overdue", "loan-extended", "loan-follow-up"]);
const MEETING_TEMPLATES = new Set<EmailTemplateName>(["meeting-booked", "meeting-updated", "meeting-cancelled"]);

function buildElement<T extends EmailTemplateName>(template: T, props: EmailTemplates[T]): ReactElement {
  if (template === "reminder-expiry") return <ReminderEmail {...(props as ReminderEmailProps)} />;
  if (template === "holiday-change") return <HolidayEmail {...(props as HolidayEmailProps)} />;
  if (template === "security-notice") return <SecurityEmail {...(props as SecurityEmailProps)} />;
  if (template === "security-alert") return <SecurityEmail {...(props as SecurityEmailProps)} variant="admin" />;
  if (LOAN_TEMPLATES.has(template)) return <DemoLoanEmail {...(props as DemoLoanEmailProps)} />;
  if (MEETING_TEMPLATES.has(template)) return <MeetingBookingEmail {...(props as MeetingBookingEmailProps)} />;
  return <ApprovalEmail {...(props as ApprovalEmailProps)} template={template as ApprovalEmailProps["template"]} />;
}

export async function renderEmail<T extends EmailTemplateName>(template: T, props: EmailTemplates[T]) {
  const element = buildElement(template, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
