import type {
  AssistantLanguage,
  AssistantReference,
  DetectedLanguage,
  SessionUser,
} from '@nova/shared';
import type { Prisma } from '@nova/db';

/** What a read tool returns: a plain-language answer, structured data, and linkable entities. */
export interface ToolResult {
  text: string;
  data?: unknown;
  references: AssistantReference[];
}

export type ProposalKind = 'CREATE_TASK' | 'UPDATE_TASK' | 'ADVANCE_PROJECT' | 'LOG_INTERACTION';

/**
 * A proposed change. Nothing is written until the user confirms; the payload is replayed
 * through the normal domain service at that point.
 */
export interface ProposalDraft {
  kind: ProposalKind;
  title: string;
  payload: Prisma.InputJsonValue;
  changes: { field: string; from: string | null; to: string }[];
  /** `updatedAt` of the target when proposed; a different value at confirm time means stale. */
  targetVersion?: string;
}

export type ProposeOutcome =
  | { ok: true; proposal: ProposalDraft; references: AssistantReference[] }
  | { ok: false; reason: string };

export interface AssistantContext {
  user: SessionUser;
  focus: { type: string; id: string } | null;
  inspect: { type: string; id: string } | null;
  history: { role: 'user' | 'assistant'; content: string }[];
  /** Voice messages get short, listenable replies. */
  channel: 'text' | 'voice';
  /** Script/word-based guess at the user's language — a hint; the model decides. */
  userLanguage: DetectedLanguage | null;
  /** Locale the speech recogniser listened in (voice only), e.g. `ml-IN`. */
  speechLanguage: string | null;
}

export interface ProviderReply {
  content: string;
  references: AssistantReference[];
  proposals: ProposalDraft[];
  suggestions: string[];
  /** Language of `content`. */
  language: AssistantLanguage | null;
}

export interface AssistantProvider {
  readonly name: 'demo' | 'claude';
  reply(message: string, ctx: AssistantContext): Promise<ProviderReply>;
}
