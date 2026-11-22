import { Injectable, Logger } from '@nestjs/common';
import type {
  AssistantHistoryItem,
  AssistantLanguage,
  AssistantMessageRequest,
  AssistantProposal,
  AssistantReference,
  AssistantReply,
  Permission,
  SessionUser,
  TaskStatus,
} from '@nova/shared';
import { baseLanguage, detectLanguage } from '@nova/shared';
import type { AssistantAction, AssistantInteraction, Project, ProjectStage, Task } from '@nova/db';
import { AppError, conflict, forbidden, notFound } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { ClientsService } from '../clients/clients.service';
import { ProjectsService } from '../projects/projects.service';
import { TasksService } from '../tasks/tasks.service';
import type {
  AssistantContext,
  ProposalDraft,
  ProposalKind,
  ProviderReply,
} from './assistant.types';
import { ClaudeProvider } from './claude.provider';
import { DemoProvider } from './demo.provider';

const REQUIRED: Record<ProposalKind, Permission> = {
  CREATE_TASK: 'task:write',
  UPDATE_TASK: 'task:write',
  ADVANCE_PROJECT: 'workflow:transition',
  LOG_INTERACTION: 'client:write',
};

type ActionRow = AssistantAction;
type ActionData = Pick<
  AssistantAction,
  'interactionId' | 'kind' | 'payload' | 'preview' | 'targetVersion'
>;

/**
 * NOVA orchestration (ADR-0005): picks a provider, persists the conversation, stores proposals,
 * and executes a proposal only when the user confirms it — through the same domain services the
 * UI uses, so permissions, workflow rules and the audit trail apply unchanged.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger('NOVA');

  constructor(
    private readonly database: DatabaseService,
    private readonly demo: DemoProvider,
    private readonly claude: ClaudeProvider,
    private readonly projects: ProjectsService,
    private readonly tasks: TasksService,
    private readonly clients: ClientsService,
  ) {}

  status() {
    return {
      provider: this.claude.enabled ? 'claude' : 'demo',
      model: this.claude.enabled ? this.claude.model : null,
    } as const;
  }

  async history(user: SessionUser): Promise<AssistantHistoryItem[]> {
    const rows = await this.database.models.AssistantInteraction.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .limit(40)
      .populate({ path: 'actions', options: { sort: { createdAt: 1 } } })
      .lean<(AssistantInteraction & { actions: AssistantAction[] })[]>();
    return rows.reverse().map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      language: toLanguage(r.language, r.languageSource),
      references: (r.references as AssistantReference[] | null) ?? [],
      proposals: r.actions.map((a) => this.toProposal(a)),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async message(user: SessionUser, req: AssistantMessageRequest): Promise<AssistantReply> {
    const recent = await this.database.models.AssistantInteraction.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .limit(8)
      .select({ role: 1, content: 1 })
      .lean<Pick<AssistantInteraction, 'id' | 'role' | 'content'>[]>();
    // A hint for the providers (and the record): the model itself decides the reply language.
    const detected = detectLanguage(req.message);
    const speechLanguage = req.channel === 'voice' ? (req.speechLanguage ?? null) : null;
    const spoken = baseLanguage(speechLanguage);
    const userLanguage: AssistantLanguage | null = detected
      ? { code: detected.code, source: 'detected' }
      : spoken
        ? { code: spoken, source: 'detected' }
        : null;
    const ctx: AssistantContext = {
      user,
      channel: req.channel ?? 'text',
      userLanguage: detected,
      speechLanguage,
      focus: req.context?.focus ?? null,
      inspect: req.context?.inspect ?? null,
      history: recent
        .reverse()
        .map((r) => ({ role: r.role === 'USER' ? 'user' : 'assistant', content: r.content })),
    };

    let provider: 'demo' | 'claude' = this.claude.enabled ? 'claude' : 'demo';
    let result: ProviderReply;
    try {
      result =
        provider === 'claude'
          ? await this.claude.reply(req.message, ctx)
          : await this.demo.reply(req.message, ctx);
    } catch (error) {
      // Claude unavailable (network, quota, key): answer locally rather than fail.
      this.logger.warn(
        `Claude provider failed, using demo mode: ${error instanceof Error ? error.message : String(error)}`,
      );
      provider = 'demo';
      result = await this.demo.reply(req.message, ctx);
      result.content = `_Claude is unavailable right now — answered in demo mode._\n${result.content}`;
    }

    const { AssistantInteraction: Interactions, AssistantAction: Actions } = this.database.models;
    // Writes are awaited one after another: every call joins the transaction, which MongoDB may
    // re-run on a transient conflict (so the result arrays are rebuilt inside the callback).
    const { assistant, actions } = await this.database.transaction(async () => {
      await Interactions.create({
        userId: user.id,
        role: 'USER',
        content: req.message,
        focusContext: req.context ?? undefined,
        provider,
        language: userLanguage?.code ?? null,
        languageSource: userLanguage?.source ?? null,
      });
      const assistant = (
        await Interactions.create({
          userId: user.id,
          role: 'ASSISTANT',
          content: result.content,
          references: result.references,
          provider,
          language: result.language?.code ?? null,
          languageSource: result.language?.source ?? null,
        })
      ).toObject() as AssistantInteraction;
      const actions: ActionRow[] = [];
      for (const p of result.proposals)
        actions.push((await Actions.create(this.actionData(assistant.id, p))).toObject());
      return { assistant, actions };
    });

    return {
      id: assistant.id,
      provider,
      content: result.content,
      language: result.language,
      userLanguage,
      references: result.references,
      proposals: actions.map((a) => this.toProposal(a)),
      suggestions: result.suggestions,
      createdAt: assistant.createdAt.toISOString(),
    };
  }

  async confirm(actionId: string, user: SessionUser): Promise<AssistantProposal> {
    const action = await this.load(actionId, user);
    const kind = action.kind as ProposalKind;
    if (!user.permissions.includes(REQUIRED[kind]))
      throw forbidden('Your role cannot apply this change.');

    if (await this.isStale(action)) {
      const stale = await this.setAction(actionId, {
        status: 'STALE',
        resolvedAt: new Date(),
        error: 'The target changed after this was proposed. Ask NOVA again for a fresh proposal.',
      });
      return this.toProposal(stale);
    }

    // Claim the proposal before applying it: of two simultaneous confirmations (a double
    // click, two tabs) exactly one may run the change.
    const claimed = await this.database.models.AssistantAction.updateMany(
      { _id: actionId, status: 'PROPOSED' },
      { $set: { status: 'CONFIRMED', resolvedAt: new Date() } },
    );
    if (claimed.matchedCount === 0) {
      throw conflict('ALREADY_RESOLVED', 'This proposal was already resolved.');
    }

    const p = action.payload as Record<string, unknown>;
    try {
      let resultEntityId: string | null = null;
      switch (kind) {
        case 'CREATE_TASK': {
          const task = await this.tasks.create(
            {
              projectId: p.projectId as string,
              projectStageId: (p.projectStageId as string | null) ?? undefined,
              title: p.title as string,
              assigneeId: (p.assigneeId as string | null) ?? undefined,
              dueDate: p.dueDate ? new Date(p.dueDate as string) : undefined,
              isStageBlocking: Boolean(p.isStageBlocking),
              priority: 'MEDIUM',
              description: 'Created via NOVA assistant (confirmed by user).',
            },
            user,
            'ASSISTANT',
          );
          resultEntityId = task.id;
          break;
        }
        case 'UPDATE_TASK': {
          const task = await this.tasks.update(
            p.taskId as string,
            {
              ...(p.status ? { status: p.status as TaskStatus } : {}),
              ...(p.assigneeId ? { assigneeId: p.assigneeId as string } : {}),
            },
            user,
            'ASSISTANT',
          );
          resultEntityId = task.id;
          break;
        }
        case 'ADVANCE_PROJECT': {
          const project = await this.projects.transition(
            p.projectId as string,
            { direction: 'FORWARD' },
            user,
            'ASSISTANT',
          );
          resultEntityId = project.id;
          break;
        }
        case 'LOG_INTERACTION': {
          await this.clients.logInteraction(
            p.clientId as string,
            {
              type: p.type as 'CALL',
              summary: p.summary as string,
              projectId: (p.projectId as string | null) ?? undefined,
            },
            user,
            'ASSISTANT',
          );
          resultEntityId = p.clientId as string;
          break;
        }
      }
      const done = await this.setAction(actionId, { resultEntityId });
      return this.toProposal(done);
    } catch (error) {
      // A domain rule (AppError) explains itself to the user. Anything else is a fault: it is
      // logged in full and the user gets a neutral message instead of internals.
      const expected = error instanceof AppError;
      if (!expected) {
        this.logger.error(
          `Proposal ${actionId} (${kind}) failed`,
          error instanceof Error ? error.stack : String(error),
        );
      }
      const failed = await this.setAction(actionId, {
        status: 'FAILED',
        resolvedAt: new Date(),
        error: expected ? error.message : 'The change could not be applied.',
      });
      return this.toProposal(failed);
    }
  }

  async cancel(actionId: string, user: SessionUser): Promise<AssistantProposal> {
    await this.load(actionId, user);
    const cancelled = await this.database.models.AssistantAction.updateMany(
      { _id: actionId, status: 'PROPOSED' },
      { $set: { status: 'CANCELLED', resolvedAt: new Date() } },
    );
    if (cancelled.matchedCount === 0) {
      throw conflict('ALREADY_RESOLVED', 'This proposal was already resolved.');
    }
    const row = await this.database.models.AssistantAction.findById(actionId).lean<ActionRow>();
    if (!row) throw notFound('Proposal');
    return this.toProposal(row);
  }

  /** Writes fields of a proposal and returns it (404 if it vanished meanwhile). */
  private async setAction(
    actionId: string,
    data: Partial<Pick<AssistantAction, 'status' | 'resolvedAt' | 'error' | 'resultEntityId'>>,
  ): Promise<ActionRow> {
    const row = await this.database.models.AssistantAction.findByIdAndUpdate(
      actionId,
      { $set: data },
      { new: true },
    ).lean<ActionRow>();
    if (!row) throw notFound('Proposal');
    return row;
  }

  private async load(actionId: string, user: SessionUser) {
    const action = await this.database.models.AssistantAction.findById(actionId)
      .populate({ path: 'interaction', select: { userId: 1 } })
      .lean<ActionRow & { interaction: Pick<AssistantInteraction, 'id' | 'userId'> | null }>();
    if (!action || !action.interaction || action.interaction.userId !== user.id)
      throw notFound('Proposal');
    if (action.status !== 'PROPOSED')
      throw conflict(
        'ALREADY_RESOLVED',
        `This proposal was already ${action.status.toLowerCase()}.`,
      );
    return action;
  }

  private async isStale(action: ActionRow): Promise<boolean> {
    if (!action.targetVersion) return false;
    const p = action.payload as Record<string, unknown>;
    const { Task: Tasks, Project: Projects, ProjectStage: Stages } = this.database.models;
    // `targetVersion` is the target's `updatedAt` (ISO) when proposed; the schema hooks keep
    // `updatedAt` current on every write, so the same ISO comparison detects a change.
    const current =
      action.kind === 'UPDATE_TASK'
        ? await Tasks.findById(p.taskId as string)
            .select({ updatedAt: 1 })
            .lean<Pick<Task, 'id' | 'updatedAt'>>()
        : action.kind === 'ADVANCE_PROJECT'
          ? await Projects.findById(p.projectId as string)
              .select({ updatedAt: 1 })
              .lean<Pick<Project, 'id' | 'updatedAt'>>()
          : null;
    if (action.kind === 'ADVANCE_PROJECT') {
      // Stage changes don't touch project.updatedAt, so also check the stage is still current.
      const stage = p.fromStageId
        ? await Stages.findById(p.fromStageId as string)
            .select({ status: 1 })
            .lean<Pick<ProjectStage, 'id' | 'status'>>()
        : null;
      if (!stage || (stage.status !== 'ACTIVE' && stage.status !== 'BLOCKED')) return true;
    }
    return !current || current.updatedAt.toISOString() !== action.targetVersion;
  }

  private actionData(interactionId: string, p: ProposalDraft): ActionData {
    return {
      interactionId,
      kind: p.kind,
      payload: p.payload,
      preview: { title: p.title, changes: p.changes },
      targetVersion: p.targetVersion ?? null,
    };
  }

  private toProposal(a: ActionRow): AssistantProposal {
    const preview = a.preview as { title: string; changes: AssistantProposal['changes'] };
    const resultType: Record<string, AssistantReference['type']> = {
      CREATE_TASK: 'task',
      UPDATE_TASK: 'task',
      ADVANCE_PROJECT: 'project',
      LOG_INTERACTION: 'client',
    };
    return {
      id: a.id,
      kind: a.kind,
      title: preview.title,
      changes: preview.changes,
      status: a.status,
      error: a.error,
      resultEntity: a.resultEntityId
        ? { type: resultType[a.kind] ?? 'project', id: a.resultEntityId, label: preview.title }
        : null,
    };
  }
}

function toLanguage(code: string | null, source: string | null): AssistantLanguage | null {
  if (!code) return null;
  return { code, source: source === 'model' ? 'model' : 'detected' };
}
