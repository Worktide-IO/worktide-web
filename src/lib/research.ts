import type { HydraItemBaseSchema } from '@/api/types/HydraItemBaseSchema.ts';
import { api, readAuth, WORKSPACE_STORAGE_KEY } from '@/lib/api';

/**
 * Client for the research/acquisition agent (backend Phase 1–3).
 *
 * Missions, leads and activities ARE API-Platform resources (read them via the
 * dataProvider / useList / useTable). The stateful actions — the clarification
 * dialog (create/answer), kicking off a discovery run, and lead stage/convert —
 * are plain Symfony route controllers, so they're called via the raw axios
 * instance, same idiom as `src/lib/ai.ts` / `src/lib/social.ts`. Types are
 * hand-authored (gen:api is broken); migrate to @/api/types once it's fixed.
 */

export type ResearchObjective =
  | 'lead_generation'
  | 'partner_search'
  | 'market_research'
  | 'content_distribution'
  | 'general';

export type ResearchMissionStatus =
  | 'draft'
  | 'clarifying'
  | 'ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'archived';

export type LeadStage =
  | 'discovered'
  | 'qualified'
  | 'contacted'
  | 'engaged'
  | 'won'
  | 'lost'
  | 'on_hold';

export type LeadSource =
  | 'web_search'
  | 'forum'
  | 'linkedin'
  | 'directory'
  | 'referral'
  | 'manual'
  | 'import';

/** A normalized research brief (accumulated across the clarification dialog). */
export type ResearchBrief = {
  query?: string;
  targetCount?: number | null;
  region?: string | null;
  industry?: string | null;
  tech?: string | null;
  segment?: string | null;
  limit?: number | null;
  criteria?: string[];
};

export type ResearchMissionJsonld = HydraItemBaseSchema & {
  id?: string;
  prompt: string;
  objective: ResearchObjective;
  createdVia?: string;
  brief?: ResearchBrief | null;
  status: ResearchMissionStatus;
  foundCount?: number;
  targetCount?: number | null;
  summary?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

/** One quick-answer question the agent asks during clarification. */
export type ClarifyQuestion = { key: string; question: string; options: string[] };

export type MissionMessageJsonld = HydraItemBaseSchema & {
  id?: string;
  mission?: string;
  role: 'agent' | 'user';
  content: string;
  question?: { questions?: ClarifyQuestion[] } | null;
  createdAt?: string;
};

export type LeadJsonld = HydraItemBaseSchema & {
  id?: string;
  mission?: string | null;
  isCompany?: boolean;
  name: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  role?: string | null;
  industry?: string | null;
  region?: string | null;
  source?: LeadSource;
  sourceUrl?: string | null;
  fitScore?: number | null;
  scoreReason?: string | null;
  stage: LeadStage;
  convertedCustomer?: string | null;
  assignedTo?: string | null;
  notes?: string | null;
  createdAt?: string;
};

export type LeadActivityJsonld = HydraItemBaseSchema & {
  id?: string;
  lead?: string;
  type: string;
  channel?: string | null;
  payload?: Record<string, unknown> | null;
  occurredAt?: string;
  outcome?: string | null;
};

export type LeadActivityType =
  | 'discovered'
  | 'enriched'
  | 'stage_change'
  | 'email_sent'
  | 'reply'
  | 'forum_post'
  | 'call'
  | 'note';

export const LEAD_ACTIVITY_LABEL: Record<string, string> = {
  discovered: 'lead.activity.discovered',
  enriched: 'lead.activity.enriched',
  stage_change: 'lead.activity.stage_change',
  email_sent: 'lead.activity.email_sent',
  reply: 'lead.activity.reply',
  forum_post: 'lead.activity.forum_post',
  call: 'lead.activity.call',
  note: 'lead.activity.note',
};

/** Response shape of the create/answer clarification endpoints. */
export type ClarifyResponse = {
  id: string;
  status: ResearchMissionStatus;
  objective: ResearchObjective;
  ready: boolean;
  message?: string | null;
  questions: ClarifyQuestion[];
  brief?: ResearchBrief | null;
};

// -- label maps -------------------------------------------------------------

export const OBJECTIVE_LABEL: Record<ResearchObjective, string> = {
  lead_generation: 'research.objective.lead_generation',
  partner_search: 'research.objective.partner_search',
  market_research: 'research.objective.market_research',
  content_distribution: 'research.objective.content_distribution',
  general: 'research.objective.general',
};

export const MISSION_STATUS_LABEL: Record<ResearchMissionStatus, string> = {
  draft: 'mission.status.draft',
  clarifying: 'mission.status.clarifying',
  ready: 'mission.status.ready',
  running: 'mission.status.running',
  paused: 'mission.status.paused',
  completed: 'mission.status.completed',
  failed: 'mission.status.failed',
  archived: 'mission.status.archived',
};

export const MISSION_STATUS_VARIANT: Record<ResearchMissionStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  clarifying: 'default',
  ready: 'default',
  running: 'default',
  paused: 'outline',
  completed: 'secondary',
  failed: 'destructive',
  archived: 'outline',
};

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  discovered: 'lead.stage.discovered',
  qualified: 'lead.stage.qualified',
  contacted: 'lead.stage.contacted',
  engaged: 'lead.stage.engaged',
  won: 'lead.stage.won',
  lost: 'lead.stage.lost',
  on_hold: 'lead.stage.on_hold',
};

/** Stages in pipeline order — for the stage <Select> and board-ish ordering. */
export const LEAD_STAGES: LeadStage[] = [
  'discovered',
  'qualified',
  'contacted',
  'engaged',
  'won',
  'lost',
  'on_hold',
];

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  web_search: 'lead.source.web_search',
  forum: 'lead.source.forum',
  linkedin: 'lead.source.linkedin',
  directory: 'lead.source.directory',
  referral: 'lead.source.referral',
  manual: 'lead.source.manual',
  import: 'lead.source.import',
};

// -- custom-endpoint actions ------------------------------------------------

export const researchMission = {
  /**
   * Create a mission from a free-text prompt and get the agent's first
   * clarifying questions (or a ready brief). `workspace` is the current
   * workspace uuid — the backend accepts a uuid or an IRI.
   */
  create: (payload: {
    prompt: string;
    workspace: string;
    objective?: ResearchObjective;
    targetCount?: number;
  }): Promise<ClarifyResponse> =>
    api.post<ClarifyResponse>('/research-missions/create', payload).then((r) => r.data),

  /** Answer the agent's questions; refines the brief and may flip to ready. */
  answer: (id: string, answer: string): Promise<ClarifyResponse> =>
    api.post<ClarifyResponse>(`/research-missions/${id}/answer`, { answer }).then((r) => r.data),

  /**
   * Kick off one discovery pass (202). 409s when LLM / external search isn't
   * configured or the llm / external_search egress modules aren't approved.
   */
  run: (id: string): Promise<unknown> =>
    api.post(`/research-missions/${id}/run`).then((r) => r.data),
};

export const leadActions = {
  /** Move a lead to a new pipeline stage (writes a stage_change activity). */
  setStage: (id: string, stage: LeadStage): Promise<unknown> =>
    api.post(`/leads/${id}/stage`, { stage }).then((r) => r.data),

  /** Convert a lead into a Customer (sets convertedCustomer, stage → won). */
  convert: (id: string): Promise<unknown> =>
    api.post(`/leads/${id}/convert`).then((r) => r.data),
};

export const leadActivities = {
  /**
   * Append a manual note to a lead's timeline. lead_activities is a normal
   * API-Platform resource, so we POST the IRIs directly (workspace comes from
   * the active workspace; occurredAt is stamped server-side).
   */
  addNote: (leadIri: string, note: string): Promise<unknown> => {
    const ws = readAuth(WORKSPACE_STORAGE_KEY);
    return api
      .post('/lead_activities', {
        lead: leadIri,
        workspace: ws ? `/v1/workspaces/${ws}` : undefined,
        type: 'note',
        payload: { note },
      })
      .then((r) => r.data);
  },
};
