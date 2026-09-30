// Render template email → HTML + teks polos. Dipakai worker (bukan request web).
import { render } from "@react-email/components";
import type { ReactElement } from "react";
import { ApprovalEmail, type ApprovalEmailProps } from "./templates/approval-email";
import { ReminderEmail, type ReminderEmailProps } from "./templates/reminder-email";

/** Semua template yang bisa di-enqueue beserta props-nya. */
export type EmailTemplates = {
  "approval-requested": ApprovalEmailProps;
  "approval-progress": ApprovalEmailProps;
  "approval-final": ApprovalEmailProps;
  "reminder-expiry": ReminderEmailProps;
};

export type EmailTemplateName = keyof EmailTemplates;

function buildElement<T extends EmailTemplateName>(template: T, props: EmailTemplates[T]): ReactElement {
  if (template === "reminder-expiry") return <ReminderEmail {...(props as ReminderEmailProps)} />;
  return <ApprovalEmail {...(props as ApprovalEmailProps)} template={template as ApprovalEmailProps["template"]} />;
}

export async function renderEmail<T extends EmailTemplateName>(template: T, props: EmailTemplates[T]) {
  const element = buildElement(template, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
