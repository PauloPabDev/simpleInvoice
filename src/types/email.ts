// ── Email template & instance types ─────────────────────────────

export interface EmailSummaryField {
  label: string;
  value: string;
}

export type EmailSectionType =
  | 'greeting'
  | 'paragraph'
  | 'summary-card'
  | 'cta'
  | 'highlight'
  | 'divider';

export interface EmailSection {
  id: string;
  type: EmailSectionType;
  visible: boolean;
  // text content (greeting, paragraph, highlight)
  content?: string;
  // summary-card fields
  fields?: EmailSummaryField[];
  // cta button
  text?: string;
  url?: string;
}

export interface Email {
  templateId: string;
  subject: string;
  recipientEmail: string;
  recipientName: string;
  /** Document-level variables like docNumber, projectName, total, dueDate */
  variables: Record<string, string>;
  sections: EmailSection[];
  /** Optional 1×1 tracking pixel URL appended to the exported HTML */
  trackingPixelUrl?: string;
}

export interface EmailTemplate {
  templateId: string;
  name: string;
  description: string;
  icon: string;
  /** Variable keys the template uses (beyond recipientName/providerXxx) */
  variables: string[];
  /** Human-readable labels for each variable key */
  variableLabels: Record<string, string>;
  defaultSections: EmailSection[];
}
