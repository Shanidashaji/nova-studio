import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TASK_STATUSES,
  extractReplyLanguage,
  languageName,
  type AssistantReference,
} from '@nova/shared';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env';
import { AssistantTools } from './assistant.tools';
import type {
  AssistantContext,
  AssistantProvider,
  ProposalDraft,
  ProviderReply,
  ToolResult,
} from './assistant.types';

const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_TOOL_ROUNDS = 6;

const SYSTEM = `You are NOVA, the operations assistant inside the internal workspace of Neon Minds, a media production studio in Kozhikode and Chennai (product videos, brand films, storytelling ads, corporate videos, social reels). Every project follows Brief → Pre-production → Shoot → Edit → Review → Delivery.

Answer from the tools, never from memory: studio data changes constantly. All data in this workspace is demonstration data; say so if asked about real figures.

You cannot change anything yourself. To create a task, update a task, move a project to its next stage or log a client interaction, call the matching propose_* tool. It returns a proposal the user must confirm in the interface. Say plainly that the change is proposed and waiting for their confirmation — never say it has been done.

Language:
- Reply in the language of the user's latest message — Malayalam, Hindi, Tamil, Telugu, Kannada, Bengali, Arabic, Urdu, French, German, Spanish or any other. Do not switch to English unless they write in English or ask for it.
- People code-switch: Malayalam or Hindi with English technical words, or a whole message in Latin transliteration ("Manglish", "Hinglish"). Understand the overall meaning and answer in the same style — keep the English terms they used (project, deadline, shoot, edit) and write in the script they used.
- If they change language mid-conversation, follow the change. If they ask for a translation or a specific language, use that.
- Tool output is in English. Translate your explanation, but keep names of productions, people, clients and codes exactly as the tools return them. Amounts are Indian rupees.
- Begin every final answer with a language tag on its own first line, e.g. [lang:ml], [lang:hi], [lang:en] or [lang:pt-BR]: the BCP-47 code of the language the answer is written in (the dominant one if mixed). The interface removes the tag and uses it to pick a voice.

Personality: calm, professional, friendly and clear — a capable colleague, not a robot. Be concise: answer simple operational questions in a sentence or two; for larger answers give one sentence of conclusion, then bullet points with the numbers that matter. Use **bold** for names of productions and people. No filler and no repeated disclaimers.`;

/** Tool definitions shared with the model. Inputs are validated with Zod before running. */
const TOOLS: { def: Anthropic.Beta.BetaTool; schema: z.ZodType }[] = [
  {
    def: {
      name: 'get_attention',
      description:
        'Ranked list of issues that need a decision now (overdue work, waiting approvals, blocked tasks, double bookings, overloaded crew), each with its reason.',
      input_schema: { type: 'object', properties: {} },
    },
    schema: z.object({}),
  },
  {
    def: {
      name: 'get_operations_summary',
      description:
        'Headline state of the studio: productions per stage, risk counts, approvals waiting, the pipeline constraint, upcoming shoots.',
      input_schema: { type: 'object', properties: {} },
    },
    schema: z.object({}),
  },
  {
    def: {
      name: 'list_projects',
      description:
        'Active productions filtered by condition, with stage, due date, progress, health score and the reasons behind it.',
      input_schema: {
        type: 'object',
        properties: {
          filter: { type: 'string', enum: ['delayed', 'at_risk', 'due_soon', 'active'] },
          days: { type: 'integer', description: 'Window for due_soon, default 7' },
        },
        required: ['filter'],
      },
    },
    schema: z.object({
      filter: z.enum(['delayed', 'at_risk', 'due_soon', 'active']),
      days: z.number().int().min(1).max(60).optional(),
    }),
  },
  {
    def: {
      name: 'get_project',
      description:
        'Briefing on one production: stage, health, projected delivery, what blocks the next stage, pending approvals, next shoot, budget. Accepts a title, code, or "this project".',
      input_schema: {
        type: 'object',
        properties: { project: { type: 'string' } },
        required: ['project'],
      },
    },
    schema: z.object({ project: z.string().min(1) }),
  },
  {
    def: {
      name: 'get_blocked_work',
      description: 'Blocked tasks and productions waiting on client approval.',
      input_schema: { type: 'object', properties: {} },
    },
    schema: z.object({}),
  },
  {
    def: {
      name: 'get_team_workload',
      description: 'Each team member’s load for the next 7 days against capacity.',
      input_schema: { type: 'object', properties: {} },
    },
    schema: z.object({}),
  },
  {
    def: {
      name: 'get_pending_approvals',
      description: 'Client approvals still waiting, oldest first.',
      input_schema: { type: 'object', properties: {} },
    },
    schema: z.object({}),
  },
  {
    def: {
      name: 'get_upcoming_shoots',
      description: 'Shoots in the next N days with crew, equipment and conflicts.',
      input_schema: { type: 'object', properties: { days: { type: 'integer' } } },
    },
    schema: z.object({ days: z.number().int().min(1).max(30).optional() }),
  },
  {
    def: {
      name: 'get_activity_summary',
      description: 'What changed in the last N days: counts by kind and the most recent entries.',
      input_schema: { type: 'object', properties: { days: { type: 'integer' } } },
    },
    schema: z.object({ days: z.number().int().min(1).max(60).optional() }),
  },
  {
    def: {
      name: 'propose_create_task',
      description:
        'Propose a new task. The user must confirm it. due_date is ISO 8601 (YYYY-MM-DD).',
      input_schema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          title: { type: 'string' },
          assignee: {
            type: 'string',
            description: 'Person name or role, e.g. "Fathima" or "editor"',
          },
          due_date: { type: 'string' },
          blocks_stage: { type: 'boolean' },
        },
        required: ['project', 'title'],
      },
    },
    schema: z.object({
      project: z.string(),
      title: z.string().min(3).max(160),
      assignee: z.string().optional(),
      due_date: z.string().optional(),
      blocks_stage: z.boolean().optional(),
    }),
  },
  {
    def: {
      name: 'propose_update_task',
      description: 'Propose changing a task’s status and/or assignee. The user must confirm it.',
      input_schema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          project: { type: 'string' },
          status: { type: 'string', enum: [...TASK_STATUSES] },
          assignee: { type: 'string' },
        },
        required: ['task'],
      },
    },
    schema: z.object({
      task: z.string(),
      project: z.string().optional(),
      status: z.enum(TASK_STATUSES).optional(),
      assignee: z.string().optional(),
    }),
  },
  {
    def: {
      name: 'propose_advance_project',
      description:
        'Propose moving a production to its next workflow stage. Workflow rules are checked first; if blocked, the reason is returned instead.',
      input_schema: {
        type: 'object',
        properties: { project: { type: 'string' } },
        required: ['project'],
      },
    },
    schema: z.object({ project: z.string() }),
  },
  {
    def: {
      name: 'propose_log_interaction',
      description:
        'Propose recording a client interaction (call, email, meeting, WhatsApp or feedback).',
      input_schema: {
        type: 'object',
        properties: {
          client: { type: 'string' },
          type: { type: 'string', enum: ['CALL', 'EMAIL', 'MEETING', 'WHATSAPP', 'FEEDBACK'] },
          summary: { type: 'string' },
        },
        required: ['type', 'summary'],
      },
    },
    schema: z.object({
      client: z.string().optional(),
      type: z.string(),
      summary: z.string().min(3).max(1000),
    }),
  },
];

/**
 * NOVA backed by Claude (enabled when ANTHROPIC_API_KEY is set). A manual tool-use loop over the
 * same tools as demo mode; write tools only produce proposals for the user to confirm.
 */
@Injectable()
export class ClaudeProvider implements AssistantProvider {
  readonly name = 'claude' as const;
  private readonly logger = new Logger('NOVA');
  private readonly client: Anthropic | null;
  readonly model: string;

  constructor(
    @Inject(ENV) env: Env,
    private readonly tools: AssistantTools,
  ) {
    this.client = env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 60_000 })
      : null;
    this.model = env.ASSISTANT_MODEL ?? DEFAULT_MODEL;
  }

  get enabled() {
    return this.client !== null;
  }

  async reply(message: string, ctx: AssistantContext): Promise<ProviderReply> {
    if (!this.client) throw new Error('Claude provider is not configured.');
    const references: AssistantReference[] = [];
    const proposals: ProposalDraft[] = [];
    const focusNote =
      ctx.inspect || ctx.focus
        ? `\n\n[Workspace context: ${ctx.inspect ? `the user has ${ctx.inspect.type} ${ctx.inspect.id} open in the inspector` : ''}${ctx.inspect && ctx.focus ? '; ' : ''}${ctx.focus ? `the workspace is focused on ${ctx.focus.type} ${ctx.focus.id}` : ''}. "This project" refers to it.]`
        : '';
    const voiceNote =
      ctx.channel === 'voice'
        ? `\n\n[Spoken message transcribed by speech recognition${ctx.speechLanguage ? ` listening in ${ctx.speechLanguage}` : ''}; it may contain recognition errors, so infer the intended words. Your reply is read aloud: two or three short spoken sentences, no tables, at most a short list.]`
        : '';

    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...ctx.history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: `${message}${focusNote}${voiceNote}` },
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        system: SYSTEM,
        tools: TOOLS.map((t) => t.def),
        tool_choice: { type: 'auto' },
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        // Server-side refusal fallbacks: a declined request is retried on a fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages,
      });

      if (response.stop_reason === 'refusal') {
        return {
          content:
            'I can’t help with that request. Try asking about productions, schedules, people or approvals.',
          references,
          proposals,
          suggestions: [],
          language: { code: 'en', source: 'model' },
        };
      }

      // Pass the assistant turn back unchanged (thinking blocks included).
      messages.push({
        role: 'assistant',
        content: response.content as Anthropic.Beta.BetaContentBlockParam[],
      });

      if (response.stop_reason !== 'tool_use') {
        const text = response.content
          .flatMap((b) => (b.type === 'text' ? [b.text] : []))
          .join('\n')
          .trim();
        // The model declares its reply language in a first-line tag; detection covers a missing tag.
        const { content, language, source } = extractReplyLanguage(text);
        if (source === 'detected')
          this.logger.debug(`Reply had no language tag; detected ${languageName(language)}`);
        return {
          content: content.trim() || 'Done.',
          references: dedupe(references),
          proposals,
          suggestions: [],
          language: language && source ? { code: language, source } : null,
        };
      }

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const out = await this.runTool(block.name, block.input, ctx, proposals).catch(
          (e: unknown) => ({ error: e instanceof Error ? e.message : 'Tool failed' }),
        );
        if ('error' in out) {
          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: out.error,
            is_error: true,
          });
        } else {
          references.push(...out.references);
          results.push({ type: 'tool_result', tool_use_id: block.id, content: out.text });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    this.logger.warn('Tool loop hit the round limit');
    return {
      content:
        'I gathered the information but ran out of steps to summarise it. Try a narrower question.',
      references: dedupe(references),
      proposals,
      suggestions: [],
      language: { code: 'en', source: 'model' },
    };
  }

  private async runTool(
    name: string,
    rawInput: unknown,
    ctx: AssistantContext,
    proposals: ProposalDraft[],
  ): Promise<ToolResult | { error: string }> {
    const tool = TOOLS.find((t) => t.def.name === name);
    if (!tool) return { error: `Unknown tool ${name}` };
    const parsed = tool.schema.safeParse(rawInput ?? {});
    if (!parsed.success)
      return {
        error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      };
    const input = parsed.data as Record<string, unknown>;

    const propose = (
      outcome: Awaited<ReturnType<AssistantTools['proposeAdvance']>>,
    ): ToolResult => {
      if (!outcome.ok) return { text: `Not proposed: ${outcome.reason}`, references: [] };
      proposals.push(outcome.proposal);
      return {
        text: `Proposal created and shown to the user for confirmation: ${outcome.proposal.title}. It has NOT been applied.`,
        references: outcome.references,
      };
    };

    switch (name) {
      case 'get_attention':
        return this.tools.attention();
      case 'get_operations_summary':
        return this.tools.operations();
      case 'list_projects':
        return this.tools.projectsBy(input.filter as 'delayed', input.days as number | undefined);
      case 'get_project':
        return this.tools.project(input.project as string, ctx);
      case 'get_blocked_work':
        return this.tools.blocked();
      case 'get_team_workload':
        return this.tools.workload();
      case 'get_pending_approvals':
        return this.tools.approvals();
      case 'get_upcoming_shoots':
        return this.tools.shoots((input.days as number | undefined) ?? 7);
      case 'get_activity_summary':
        return this.tools.activity((input.days as number | undefined) ?? 7, ctx);
      case 'propose_create_task': {
        const due =
          typeof input.due_date === 'string'
            ? new Date(`${input.due_date.slice(0, 10)}T18:00:00`)
            : null;
        return propose(
          await this.tools.proposeCreateTask(
            {
              project: input.project as string,
              title: input.title as string,
              assignee: input.assignee as string | undefined,
              dueDate: due && !Number.isNaN(due.getTime()) ? due : null,
              blocking: input.blocks_stage as boolean | undefined,
            },
            ctx,
          ),
        );
      }
      case 'propose_update_task':
        return propose(await this.tools.proposeUpdateTask(input as { task: string }, ctx));
      case 'propose_advance_project':
        return propose(await this.tools.proposeAdvance({ project: input.project as string }, ctx));
      case 'propose_log_interaction':
        return propose(
          await this.tools.proposeLogInteraction(input as { type: string; summary: string }, ctx),
        );
      default:
        return { error: `Unknown tool ${name}` };
    }
  }
}

function dedupe(refs: AssistantReference[]) {
  return [...new Map(refs.map((r) => [`${r.type}:${r.id}`, r])).values()];
}
