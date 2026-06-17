import type { LucideIcon } from 'lucide-react';
import { Bell, Bot, Cpu, Globe, Inbox, Mail, MessageSquare, Phone, Webhook } from 'lucide-react';

/**
 * Statically-defined catalog of source types the SPA can offer.
 *
 * Each entry says how to render the catalog tile (icon + label +
 * description) and which `adapterCode` it maps to on the backend.
 * Entries with `available: false` still render — slightly dimmed
 * with a "Demnächst" badge — to communicate the roadmap.
 *
 * When a new adapter ships, add it here. The backend
 * AdapterRegistry already knows what to do at runtime; this catalog
 * is just the marketing-y front face.
 */
export type SourceCategory = 'mail' | 'chat' | 'monitoring' | 'webhook' | 'voice' | 'ai';

export type SourceTypeDef = {
  code: string;
  label: string;
  description: string;
  category: SourceCategory;
  icon: LucideIcon;
  available: boolean;
  /** Authentication flavor — drives which wizard step renders. */
  auth: 'password' | 'oauth' | 'token' | 'none';
  /** Hint shown in the empty-config form ("How to set this up"). */
  setupHint?: string;
};

export const SOURCE_CATALOG: SourceTypeDef[] = [
  {
    code: 'email_imap',
    label: 'E-Mail (IMAP/SMTP)',
    description: 'Klassisches Mail-Postfach mit Benutzername + Passwort. Standard für die meisten Mail-Hoster.',
    category: 'mail',
    icon: Mail,
    available: true,
    auth: 'password',
    setupHint: 'Host + Port + Verschlüsselung von Deinem Mail-Anbieter (Strato, Hetzner, all-inkl …).',
  },
  {
    code: 'email_graph',
    label: 'Microsoft 365',
    description: 'Exchange Online über Microsoft Graph mit OAuth-Login — kein App-Passwort nötig.',
    category: 'mail',
    icon: Mail,
    available: true,
    auth: 'oauth',
  },
  {
    code: 'email_gmail',
    label: 'Google Workspace / Gmail',
    description: 'Gmail-API mit OAuth — funktioniert auch in MFA-Tenants.',
    category: 'mail',
    icon: Mail,
    available: true,
    auth: 'oauth',
  },
  {
    code: 'webhook_generic',
    label: 'Generischer Webhook',
    description: 'Beliebige JSON-Webhooks empfangen. Vorlage für Zabbix, Slack, Stripe und alles weitere.',
    category: 'webhook',
    icon: Webhook,
    available: true,
    auth: 'token',
    setupHint: 'Sender POSTet an die generierte URL — ein zufälliger Token in der URL authentifiziert.',
  },

  // Coming-soon — visible-but-disabled. Their adapterCode strings
  // are placeholders for the future and intentionally don't match
  // anything in the backend AdapterRegistry yet.
  {
    code: 'slack_bot',
    label: 'Slack',
    description: 'Slack-Bot-User für Channel-Nachrichten und DMs als InboundEvents.',
    category: 'chat',
    icon: MessageSquare,
    available: false,
    auth: 'oauth',
  },
  {
    code: 'teams_bot',
    label: 'Microsoft Teams',
    description: 'Teams-Bot über die Bot Framework SDK.',
    category: 'chat',
    icon: MessageSquare,
    available: false,
    auth: 'oauth',
  },
  {
    code: 'zabbix_webhook',
    label: 'Zabbix',
    description: 'Zabbix-Alerts direkt in den Inbox-Stream — Worktide kann daraus Tasks vorschlagen.',
    category: 'monitoring',
    icon: Bell,
    available: false,
    auth: 'token',
  },
  {
    code: 'prometheus_webhook',
    label: 'Prometheus Alertmanager',
    description: 'Alertmanager-Webhook empfängt jede Firing-Alert-Notification.',
    category: 'monitoring',
    icon: Cpu,
    available: false,
    auth: 'token',
  },
  {
    code: 'twilio_sms',
    label: 'Twilio SMS',
    description: 'SMS-Empfang über Twilio Inbound-Webhook. Reply geht über dieselbe Twilio-Nummer raus.',
    category: 'voice',
    icon: Phone,
    available: false,
    auth: 'token',
  },
  {
    code: 'whatsapp_business',
    label: 'WhatsApp Business',
    description: 'WhatsApp-Cloud-API mit Phone-Number-ID + Webhook.',
    category: 'chat',
    icon: MessageSquare,
    available: false,
    auth: 'token',
  },
  {
    code: 'voice_call',
    label: 'Voice-Calls (lokal)',
    description: 'Telefonate via Twilio Voice + lokaler Whisper-Transkription. Stimm-Daten bleiben on-prem.',
    category: 'voice',
    icon: Phone,
    available: false,
    auth: 'token',
  },
  {
    code: 'cve_feed',
    label: 'CVE / Vendor-Advisories',
    description: 'Pollt RSS/Atom-Feeds und legt neue Sicherheits-Advisories als InboundEvents an.',
    category: 'monitoring',
    icon: Bell,
    available: false,
    auth: 'none',
  },
  {
    code: 'github_advisories',
    label: 'GitHub Security Advisories',
    description: 'GraphQL-Subscription auf Security-Advisories für genutzte Pakete.',
    category: 'monitoring',
    icon: Globe,
    available: false,
    auth: 'token',
  },
];

export const CATEGORY_LABEL: Record<SourceCategory, string> = {
  mail: 'E-Mail',
  chat: 'Chat & Messaging',
  monitoring: 'Monitoring & Alerts',
  webhook: 'Webhooks',
  voice: 'Sprache & Telefonie',
  ai: 'KI / Automation',
};

export const CATEGORY_ICON: Record<SourceCategory, LucideIcon> = {
  mail: Inbox,
  chat: MessageSquare,
  monitoring: Bell,
  webhook: Webhook,
  voice: Phone,
  ai: Bot,
};

export function findSourceType(code: string | null | undefined): SourceTypeDef | null {
  if (!code) return null;
  return SOURCE_CATALOG.find((s) => s.code === code) ?? null;
}
