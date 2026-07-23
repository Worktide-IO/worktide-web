import type { LucideIcon } from 'lucide-react';
import { Bell, Bot, ChartBar, Cpu, Globe, Inbox, Mail, MessageSquare, PenLine, Phone, Rss, Shield, Ticket, Webhook } from 'lucide-react';

export type SourceCategory = 'mail' | 'chat' | 'monitoring' | 'webhook' | 'voice' | 'ai' | 'ticketing' | 'social' | 'analytics';

export type SourceTypeDef = {
  code: string;
  label: string;
  description: string;
  category: SourceCategory;
  icon: LucideIcon;
  available: boolean;
  auth: 'password' | 'oauth' | 'token' | 'apikey_pat' | 'none';
  setupHint?: string;
};

export const SOURCE_CATALOG: SourceTypeDef[] = [
  { code: 'email_imap', label: 'E-Mail (IMAP/SMTP)', description: 'Klassisches Mail-Postfach mit Benutzername + Passwort.', category: 'mail', icon: Mail, available: true, auth: 'password', setupHint: 'Host + Port + Verschlüsselung von Deinem Mail-Anbieter.' },
  { code: 'email_graph', label: 'Microsoft 365', description: 'Exchange Online über Microsoft Graph mit OAuth.', category: 'mail', icon: Mail, available: true, auth: 'oauth' },
  { code: 'email_gmail', label: 'Google Workspace / Gmail', description: 'Gmail-API mit OAuth.', category: 'mail', icon: Mail, available: true, auth: 'oauth' },
  { code: 'webhook_generic', label: 'Generischer Webhook', description: 'Beliebige JSON-Webhooks empfangen.', category: 'webhook', icon: Webhook, available: true, auth: 'token', setupHint: 'Sender POSTet an die generierte URL.' },
  { code: 'rss_feed', label: 'RSS / Atom Feed', description: 'Pollt RSS- und Atom-Feeds und legt neue Einträge als InboundEvents an.', category: 'webhook', icon: Rss, available: true, auth: 'none', setupHint: 'Feed-URL eintragen (z.B. Blog, News, Security).' },

  // --- Ticket-Systeme ---
  { code: 'redmine', label: 'Redmine', description: 'Bidirectional Live-Sync: Worktide-Tasks ↔ Redmine-Issues.', category: 'ticketing', icon: Ticket, available: true, auth: 'apikey_pat', setupHint: 'API-Key aus Deinem Redmine-Account + Server-URL.' },
  { code: 'jira', label: 'Jira', description: 'Bidirectional Live-Sync mit Jira Server/DC oder Cloud.', category: 'ticketing', icon: Ticket, available: true, auth: 'apikey_pat', setupHint: 'Jira-Server-URL + PAT (Personal Access Token).' },

  // --- Social Publishing ---
  { code: 'social_linkedin', label: 'LinkedIn', description: 'Beiträge auf LinkedIn-Unternehmensseiten veröffentlichen.', category: 'social', icon: Globe, available: true, auth: 'oauth' },
  { code: 'social_facebook', label: 'Facebook Page', description: 'Beiträge auf Facebook-Unternehmensseiten veröffentlichen.', category: 'social', icon: Globe, available: true, auth: 'token', setupHint: 'Page Access Token aus dem Facebook Graph API Explorer.' },
  { code: 'social_instagram', label: 'Instagram Business', description: 'Beiträge auf Instagram Business-Profile veröffentlichen.', category: 'social', icon: Globe, available: true, auth: 'token' },
  { code: 'social_bluesky', label: 'Bluesky', description: 'Beiträge auf Bluesky (AT Protocol) veröffentlichen.', category: 'social', icon: Globe, available: true, auth: 'password', setupHint: 'App-Passwort aus den Bluesky-Einstellungen.' },
  { code: 'social_mastodon', label: 'Mastodon', description: 'Beiträge auf Mastodon-Instanzen veröffentlichen.', category: 'social', icon: Globe, available: true, auth: 'token' },
  { code: 'social_forum_discourse', label: 'Forum (Discourse)', description: 'Themen und Beiträge in Discourse-Foren veröffentlichen.', category: 'social', icon: MessageSquare, available: true, auth: 'apikey_pat', setupHint: 'API-Key aus den Discourse-Admin-Einstellungen.' },

  // --- Content Publishing ---
  { code: 'wordpress_blog', label: 'WordPress Blog', description: 'Beiträge auf einer WordPress-Seite veröffentlichen (REST API).', category: 'social', icon: PenLine, available: true, auth: 'password', setupHint: 'WP-URL + Benutzername + Application Password.' },

  // --- Monitoring & Security ---
  { code: 'zabbix', label: 'Zabbix', description: 'Zabbix-Probleme als Conversations im Inbox-Stream.', category: 'monitoring', icon: Bell, available: true, auth: 'apikey_pat', setupHint: 'Zabbix-Frontend-URL + API-Token.' },
  { code: 'security_advisory', label: 'CVE / Security Advisories', description: 'CVE-Daten (NVD), GitHub Advisories und Packagist Advisories für genutzte Pakete.', category: 'monitoring', icon: Shield, available: true, auth: 'none', setupHint: 'Keywords eintragen (z.B. typo3,php,symfony). InboundConfig: sources=["nvd","github","packagist"].' },

  // --- Analytics ---
  { code: 'matomo_analytics', label: 'Matomo Analytics', description: 'Täglicher Analytics-Report: Visits, Pages, Referrers.', category: 'analytics', icon: ChartBar, available: true, auth: 'token', setupHint: 'Matomo-URL + authToken + siteId.' },

  // --- Coming-soon ---
  { code: 'slack_bot', label: 'Slack', description: 'Slack-Bot-User für Channel-Nachrichten.', category: 'chat', icon: MessageSquare, available: false, auth: 'oauth' },
  { code: 'teams_bot', label: 'Microsoft Teams', description: 'Teams-Bot über die Bot Framework SDK.', category: 'chat', icon: MessageSquare, available: false, auth: 'oauth' },
  { code: 'prometheus_webhook', label: 'Prometheus Alertmanager', description: 'Alertmanager-Webhook für Firing-Alerts.', category: 'monitoring', icon: Cpu, available: false, auth: 'token' },
  { code: 'twilio_sms', label: 'Twilio SMS', description: 'SMS-Empfang über Twilio Inbound-Webhook.', category: 'voice', icon: Phone, available: false, auth: 'token' },
  { code: 'whatsapp_business', label: 'WhatsApp Business', description: 'WhatsApp-Cloud-API mit Phone-Number-ID.', category: 'chat', icon: MessageSquare, available: false, auth: 'token' },
  { code: 'voice_call', label: 'Voice-Calls (lokal)', description: 'Telefonate via Twilio Voice + lokaler Transkription.', category: 'voice', icon: Phone, available: false, auth: 'token' },
];

export const CATEGORY_LABEL: Record<SourceCategory, string> = {
  mail: 'E-Mail',
  chat: 'Chat & Messaging',
  monitoring: 'Monitoring & Security',
  webhook: 'Webhooks',
  voice: 'Sprache & Telefonie',
  ai: 'KI / Automation',
  ticketing: 'Ticket-Systeme',
  social: 'Social & Content',
  analytics: 'Analytics',
};

export const CATEGORY_ICON: Record<SourceCategory, LucideIcon> = {
  mail: Inbox,
  chat: MessageSquare,
  monitoring: Bell,
  webhook: Webhook,
  voice: Phone,
  ai: Bot,
  ticketing: Ticket,
  social: Globe,
  analytics: ChartBar,
};

export function findSourceType(code: string | null | undefined): SourceTypeDef | null {
  if (!code) return null;
  return SOURCE_CATALOG.find((s) => s.code === code) ?? null;
}
