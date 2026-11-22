import { Injectable } from '@nestjs/common';
import {
  extractTaskTitle,
  languageName,
  normalize,
  parseDueDate,
  parseTaskStatus,
} from '@nova/shared';
import { AssistantTools } from './assistant.tools';
import { StudioTools } from './studio.tools';
import type {
  AssistantContext,
  AssistantProvider,
  ProviderReply,
  ToolResult,
} from './assistant.types';

/** Demo replies are always English; the language is attached once in `reply()`. */
type DemoReply = Omit<ProviderReply, 'language'>;

type Intent = { test: RegExp; run: (msg: string, ctx: AssistantContext) => Promise<DemoReply> };

const reply = (r: ToolResult, intro: string, suggestions: string[]): DemoReply => ({
  content: intro ? `${intro}\n${r.text}` : r.text,
  references: r.references,
  proposals: [],
  suggestions,
});

/**
 * Demo-mode NOVA: deterministic intent rules over live studio data. It uses exactly the same
 * tools as the Claude provider, so answers reflect the real state of the workspace — it just
 * understands a narrower range of phrasing. Clearly labelled "Demo mode" in the UI.
 */
@Injectable()
export class DemoProvider implements AssistantProvider {
  readonly name = 'demo' as const;

  constructor(
    private readonly tools: AssistantTools,
    private readonly studio: StudioTools,
  ) {}

  private readonly intents: Intent[] = [
    // ── Changes (always proposals) ──────────────────────────────────────────
    {
      test: /\b(create|add|make|new)\b.*\btask\b/,
      run: async (msg, ctx) => {
        const title = extractTaskTitle(msg);
        if (!title)
          return this.ask(
            'What should the task be called? For example: create a task “Colour grade the hero film” for Woven Light, due Friday, for Fathima.',
          );
        const rest = msg.replace(title, ' ');
        // "for X" may name the production or the person: test each phrase against the team.
        const phrases = [
          ...rest.matchAll(
            /\b(?:for|to|assign(?:ed)? to)\s+(?:the\s+)?([a-z][a-z0-9 .&-]*?)(?=\s+(?:due|by|on|in|before|for|to)\b|[,.]|$)/gi,
          ),
        ].map((m) => m[1]!.trim());
        let assignee: string | undefined;
        for (const phrase of phrases) {
          if (await this.tools.resolveMember(phrase)) {
            assignee = phrase;
            break;
          }
        }
        const { projectId } = await this.tools.splitProject(rest, ctx);
        const outcome = await this.tools.proposeCreateTask(
          {
            project: projectId ?? '',
            title,
            assignee,
            dueDate: parseDueDate(msg),
            blocking: /\bblock(?:s|ing)? (?:the )?stage\b/i.test(msg),
          },
          ctx,
        );
        return this.proposal(
          outcome,
          'Here is the task I would create. Nothing changes until you confirm.',
        );
      },
    },
    {
      test: /\b(mark|set|move|change|update|complete|finish|reopen)\b.*\b(task|done|complete|progress|blocked|review|to do)\b|\b(is|as) (done|complete|finished)\b/,
      run: async (msg, ctx) => {
        const status = parseTaskStatus(msg);
        const { projectId, rest } = await this.tools.splitProject(msg, ctx);
        const taskRef = rest.replace(
          /\b(mark|set|move|change|update|the|task|as|to|is|done|complete|completed|finished|in progress|blocked|review|on|for|please)\b/gi,
          ' ',
        );
        const outcome = await this.tools.proposeUpdateTask(
          { task: taskRef, project: projectId ?? undefined, status: status ?? undefined },
          ctx,
        );
        return this.proposal(outcome, 'Proposed task update — confirm to apply it.');
      },
    },
    {
      test: /\b(assign|reassign|give)\b.+\bto\b/,
      run: async (msg, ctx) => {
        const m = /\b(?:assign|reassign|give)\s+(?:the\s+)?(.+?)\s+to\s+(.+?)(?:[,.]|$)/i.exec(msg);
        if (!m)
          return this.ask(
            'Which task, and who should take it? For example: reassign colour grade on Campus Stories to Divya.',
          );
        // "colour grade on Campus Stories": scope the task to the named production.
        const { projectId, rest } = await this.tools.splitProject(m[1]!, ctx);
        const taskRef = rest.replace(/\b(on|in|for|the|task)\b/gi, ' ');
        const outcome = await this.tools.proposeUpdateTask(
          { task: taskRef, project: projectId ?? undefined, assignee: m[2]! },
          ctx,
        );
        return this.proposal(outcome, 'Proposed reassignment — confirm to apply it.');
      },
    },
    {
      test: /^\s*(please\s+)?advance\b|\b(move|push)\b.*\b(next stage|forward)\b/,
      run: async (msg, ctx) => {
        const ref = msg.replace(
          /\b(advance|move|push|progress|to|the|next|stage|forward|on|please)\b/gi,
          ' ',
        );
        const outcome = await this.tools.proposeAdvance({ project: ref }, ctx);
        return this.proposal(
          outcome,
          'Proposed stage transition — the workflow rules were checked and it is allowed.',
        );
      },
    },
    {
      test: /\blog\b.*\b(call|email|meeting|whatsapp|feedback)\b/,
      run: async (msg, ctx) => {
        const type = /\b(call|email|meeting|whatsapp|feedback)\b/i.exec(msg)![1]!;
        const client = /\bwith\s+([^:,.]+?)(?=[:,.]|\s+about\b|$)/i.exec(msg)?.[1];
        const summary = /[:—-]\s*(.+)$/.exec(msg)?.[1] ?? /\babout\s+(.+)$/i.exec(msg)?.[1];
        if (!summary)
          return this.ask(
            'What was it about? For example: log a call with ZenPods: marketing head will review v2 tomorrow.',
          );
        const outcome = await this.tools.proposeLogInteraction(
          { client, type, summary: summary.trim() },
          ctx,
        );
        return this.proposal(outcome, 'Proposed client log entry — confirm to record it.');
      },
    },
    // ── Questions ───────────────────────────────────────────────────────────
    {
      test: /\b(focus on|what should|morning brief|plan (for )?(my|the) day)\b/,
      run: async (_msg, ctx) =>
        reply(await this.studio.focus(ctx), '', [
          'Which shoots are scheduled today?',
          'Which tasks are overdue?',
        ]),
    },
    {
      test: /\b(shoots?|shooting|filming)\b.*\btoday\b|\btoday'?s shoots?\b/,
      run: async () =>
        reply(await this.studio.shootsToday(), '', [
          'Which crew members are available?',
          'Do any shoots have scheduling conflicts?',
        ]),
    },
    {
      test: /\b(artists?|actors?|talent|models?|cast)\b.*\b(available|free)\b|\b(available|free)\b.*\b(artists?|actors?|talent|models?)\b/,
      run: async (msg) =>
        reply(await this.studio.availability('talent', /\btomorrow\b/i.test(msg) ? 1 : 0), '', [
          'Which crew members are available?',
          'Which shoots are scheduled today?',
        ]),
    },
    {
      test: /\bcrew\b.*\b(available|free)\b|\b(available|free)\b.*\bcrew\b/,
      run: async (msg) =>
        reply(await this.studio.availability('crew', /\btomorrow\b/i.test(msg) ? 1 : 0), '', [
          'Which artists are available?',
          'Show the workload of the team',
        ]),
    },
    {
      test: /\b(conflicts?|double.?book\w*|clash\w*|overlap\w*)\b/,
      run: async () =>
        reply(await this.studio.conflicts(), '', [
          'Which shoots are scheduled today?',
          'What should the studio manager focus on today?',
        ]),
    },
    {
      test: /\boverdue\b.*\btasks?\b|\btasks?\b.*\boverdue\b/,
      run: async () =>
        reply(await this.studio.overdueTasks(), '', [
          'Which workflows are blocked?',
          'Which projects are delayed?',
        ]),
    },
    {
      test: /\bscripts?\b.*\b(approv\w*|review|waiting|pending)\b|\b(approv\w*|pending)\b.*\bscripts?\b/,
      run: async () =>
        reply(await this.studio.scriptApprovals(), 'Scripts waiting for approval:', [
          'Which approvals are waiting?',
          'Which projects are at risk?',
        ]),
    },
    {
      test: /\b(attention|today|priorit|focus on|urgent|first)\b/,
      run: async (_msg, ctx) =>
        reply(
          await this.tools.attention(ctx),
          'Here is what needs a decision, highest priority first:',
          ['Which workflows are blocked?', 'Show the workload of the team'],
        ),
    },
    {
      test: /\b(delay|delayed|late|overdue|behind|slipp)/,
      run: async (_msg, ctx) =>
        reply(
          await this.tools.projectsBy('delayed', ctx),
          'Productions that are overdue or behind schedule:',
          ['Which projects are at risk?', 'What needs my attention today?'],
        ),
    },
    {
      test: /\b(block|blocked|stuck|held|holding)\b/,
      run: async (_msg, ctx) =>
        reply(await this.tools.blocked(ctx), 'What is holding the pipeline:', [
          'Which approvals are waiting?',
          'Summarize the current operations',
        ]),
    },
    {
      test: /\b(workload|capacity|overload|busy|bandwidth|free|available|who can)\b|\bteam\b/,
      run: async () =>
        reply(await this.tools.workload(), '', [
          'Which shoots are coming up?',
          'What needs my attention today?',
        ]),
    },
    {
      test: /\b(approval|approve|sign.?off|waiting on (the )?client)/,
      run: async () =>
        reply(await this.tools.approvals(), 'Client approvals still open:', [
          'Which projects are delayed?',
          'Log a call with ZenPods: following up on v2',
        ]),
    },
    {
      // Before "due/this week": "summarize the activity from this week" is about changes.
      test: /\b(summar\w*|recap|what happened|activity|changes)\b.*\b(week|activity|days|happened|changes)\b/,
      run: async (msg, ctx) => {
        const days = /\b(\d{1,4}) days\b/.exec(msg)?.[1];
        return reply(await this.tools.activity(days ? Number(days) : 7, ctx), '', [
          'Summarize the current operations',
          'What needs my attention today?',
        ]);
      },
    },
    {
      test: /\b(deadline|due|approaching|this week|next week)\b/,
      run: async (msg, ctx) => {
        const days = /\bnext (\d+) days\b/.exec(normalize(msg))?.[1];
        return reply(
          await this.tools.projectsBy('due_soon', ctx, days ? Number(days) : 7),
          `Due in the next ${days ?? 7} days:`,
          ['Which projects are delayed?', 'Show upcoming shoots'],
        );
      },
    },
    {
      test: /\b(risk|risky|health|critical)\b/,
      run: async (_msg, ctx) =>
        reply(
          await this.tools.projectsBy('at_risk', ctx),
          'Productions below “on track”, with the reasons:',
          ['What needs my attention today?', 'Which workflows are blocked?'],
        ),
    },
    {
      test: /\b(shoot|shoots|schedule|call sheet|crew call|equipment|gear)\b/,
      run: async () =>
        reply(await this.tools.shoots(10), 'Shoots in the next 10 days:', [
          'Is any equipment double-booked?',
          'Show the workload of the team',
        ]),
    },
    {
      test: /\b(summar\w*|overview|status|operations|how are we|state of)\b/,
      run: async (msg, ctx) => {
        const projectId =
          (await this.tools.resolveProjectId(
            msg.replace(
              /\b(summar\w*|overview|status|of|the|operations|how|are|we|doing|state|current)\b/gi,
              ' ',
            ),
            ctx,
          )) ?? null;
        if (projectId && /\b(status|summar\w*) of\b|\babout\b/i.test(msg))
          return reply(await this.tools.project(projectId, ctx), '', [
            'Create a task for this project',
            'Move it to the next stage',
          ]);
        return reply(await this.tools.operations(ctx), 'Studio at a glance:', [
          'What needs my attention today?',
          'Which projects are delayed?',
        ]);
      },
    },
  ];

  /**
   * Demo mode has no language model, so it cannot understand or write other languages. It says so
   * plainly instead of pretending, above a best-effort answer from the English intent rules (mixed
   * messages with English keywords may still match one).
   */
  async reply(message: string, ctx: AssistantContext): Promise<ProviderReply> {
    const lang = ctx.userLanguage;
    const other = lang && lang.code !== 'en' && lang.confidence >= 0.5 ? lang : null;
    const out = await this.answer(message, ctx);
    if (!other) return { ...out, language: EN };
    const name = languageName(other.code) ?? other.code;
    const notice = `**Demo mode understands English only.** Your message looks like ${name}${other.romanized ? ' written in Latin letters' : ''}. When an AI provider is configured, NOVA understands ${name} and replies in it.`;
    return { ...out, content: `${notice}\n${out.content}`, language: EN };
  }

  private async answer(message: string, ctx: AssistantContext): Promise<DemoReply> {
    const text = normalize(message);
    for (const intent of this.intents) {
      if (intent.test.test(text) || intent.test.test(message.toLowerCase()))
        return intent.run(message, ctx);
    }
    // A production named on its own, or "this project" with one open, gets its briefing.
    const projectId = await this.tools.resolveProjectId(message, ctx);
    if (projectId)
      return reply(await this.tools.project(projectId, ctx), '', [
        'Create a task for this project',
        'What is blocking it?',
      ]);
    return {
      content:
        'I’m running in **demo mode**, so I understand a focused set of requests about the studio. Try one of these — or name a production to get its briefing.',
      references: [],
      proposals: [],
      suggestions: DEMO_SUGGESTIONS,
    };
  }

  private ask(question: string): DemoReply {
    return { content: question, references: [], proposals: [], suggestions: [] };
  }

  private proposal(
    outcome: Awaited<ReturnType<AssistantTools['proposeAdvance']>>,
    intro: string,
  ): DemoReply {
    if (!outcome.ok)
      return { content: outcome.reason, references: [], proposals: [], suggestions: [] };
    return {
      content: intro,
      references: outcome.references,
      proposals: [outcome.proposal],
      suggestions: [],
    };
  }
}

const EN = { code: 'en', source: 'model' } as const;

const DEMO_SUGGESTIONS = [
  'What should the studio manager focus on today?',
  'Which shoots are scheduled today?',
  'Which artists are available?',
  'Do any shoots have scheduling conflicts?',
  'Which tasks are overdue?',
  'What needs my attention today?',
  'Which projects are delayed?',
  'Which workflows are blocked?',
  'Show the workload of the team',
  'Summarize the activity from this week',
  'Create a task “Final mix review” for Woven Light due Friday',
];
