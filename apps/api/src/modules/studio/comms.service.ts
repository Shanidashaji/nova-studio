import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  isDuplicateKeyError,
  type Client,
  type ClientContact,
  type ClientMessage,
  type Deliverable,
  type MessageTemplate,
  type Project,
  type Script,
  type Shoot,
  type User,
} from '@nova/db';
import {
  MESSAGE_STATUSES,
  MESSAGE_TRIGGER_EVENTS,
  MESSAGE_TRIGGER_LABELS,
  renderTemplate,
  shootDayKeys,
  TEMPLATE_VARIABLES,
  type CommunicationsOverview,
  type ComposeMessage,
  type MessageChannel,
  type MessagePreview,
  type MessageQuery,
  type MessageStatus,
  type MessageTemplateView,
  type MessageTrigger,
  type MessageView,
  type PreviewMessage,
  type SessionUser,
  type TemplateVariable,
  type UpdateMessage,
  type UpdateTemplate,
} from '@nova/shared';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { iso, isoOrNull } from '../projects/project.mapper';
import { DEFAULT_TEMPLATES, TIME_BASED } from './comms.templates';

export interface MessageRefs {
  clientId?: string | null;
  projectId?: string | null;
  shootId?: string | null;
  scriptId?: string | null;
  deliverableId?: string | null;
  /** Previous shoot start, for schedule-change messages. */
  oldDate?: Date | null;
}

type MessageRow = ClientMessage & {
  client: Pick<Client, '_id' | 'id' | 'name'> | null;
  project: Pick<Project, '_id' | 'id' | 'code' | 'title'> | null;
  shoot: Pick<Shoot, '_id' | 'id' | 'title'> | null;
};

const VARIABLE_NAMES = new Set<string>(TEMPLATE_VARIABLES.map(([k]) => k));
const UNFILLED = /\[([a-zA-Z]+)\]/g;
const OPEN: MessageStatus[] = ['DRAFT', 'QUEUED'];

const dayFmt = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

/** Template placeholders still visible in a text (e.g. `[reviewLink]`). */
export function unfilledIn(...texts: string[]): string[] {
  const out = new Set<string>();
  for (const t of texts)
    for (const m of t.matchAll(UNFILLED)) if (VARIABLE_NAMES.has(m[1]!)) out.add(m[1]!);
  return [...out];
}

/**
 * Client communication: templates, prepared messages, review and delivery.
 *
 * Delivery is honest about what happens. Email goes out only when an email provider is
 * configured (RESEND_API_KEY + MAIL_FROM); otherwise a message the studio "sends" is recorded as
 * SIMULATED and nothing leaves NOVA. WhatsApp has no integration and is always simulated.
 * A message with unfilled placeholders can never be sent.
 */
@Injectable()
export class CommsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Comms');
  private timer: NodeJS.Timeout | null = null;
  private templatesReady = false;
  private lastDue = 0;

  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
  ) {}

  onModuleInit() {
    // A long-running server dispatches queued messages every minute. Serverless functions do not
    // live between requests, so there the queue is processed whenever Communications is opened.
    if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
      this.timer = setInterval(() => void this.dispatchDue().catch(() => undefined), 60_000);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  delivery(): CommunicationsOverview['delivery'] {
    const email = !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;
    return {
      email: email
        ? {
            provider: 'resend',
            ready: true,
            note: `Email is sent through Resend from ${process.env.MAIL_FROM}.`,
          }
        : {
            provider: 'simulated',
            ready: false,
            note: 'No email provider is configured (RESEND_API_KEY and MAIL_FROM). Sending records the message as simulated — nothing leaves NOVA.',
          },
      whatsapp: {
        provider: 'simulated',
        ready: false,
        note: 'WhatsApp is not integrated. WhatsApp messages are prepared for copy-and-send and recorded as simulated.',
      },
    };
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  async ensureTemplates() {
    if (this.templatesReady) return;
    const existing = new Set(
      (await this.database.models.MessageTemplate.find({}, { trigger: 1 }).lean()).map(
        (t) => t.trigger,
      ),
    );
    const missing = DEFAULT_TEMPLATES.filter((t) => !existing.has(t.trigger));
    if (missing.length) {
      try {
        await this.database.models.MessageTemplate.insertMany(missing, { ordered: false });
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
      }
    }
    this.templatesReady = true;
  }

  private templateView(t: MessageTemplate): MessageTemplateView {
    return {
      id: t.id,
      trigger: t.trigger,
      name: t.name,
      event: MESSAGE_TRIGGER_EVENTS[t.trigger],
      channel: t.channel,
      subject: t.subject,
      body: t.body,
      mode: t.mode,
      offsetHours: t.offsetHours,
      timeBased: TIME_BASED.has(t.trigger),
      updatedAt: iso(t.updatedAt),
    };
  }

  async templates(): Promise<MessageTemplateView[]> {
    await this.ensureTemplates();
    const order = DEFAULT_TEMPLATES.map((t) => t.trigger as string);
    const rows = await this.database.models.MessageTemplate.find().lean<MessageTemplate[]>();
    return rows
      .sort((a, b) => order.indexOf(a.trigger) - order.indexOf(b.trigger))
      .map((t) => this.templateView(t));
  }

  async updateTemplate(id: string, input: UpdateTemplate, user: SessionUser) {
    const t = await this.database.models.MessageTemplate.findById(id).lean<MessageTemplate>();
    if (!t) throw notFound('Template');
    const unknown = [
      ...`${input.subject ?? ''} ${input.body ?? ''}`.matchAll(/\{\{\s*([a-zA-Z]+)\s*\}\}/g),
    ]
      .map((m) => m[1]!)
      .filter((v) => !VARIABLE_NAMES.has(v));
    if (unknown.length) {
      throw unprocessable(
        'UNKNOWN_VARIABLE',
        `Unknown placeholder(s): ${[...new Set(unknown)].map((v) => `{{${v}}}`).join(', ')}.`,
      );
    }
    await this.activity.transaction(async (log) => {
      await this.database.models.MessageTemplate.updateOne(
        { _id: id },
        { $set: { ...input, updatedById: user.id } },
      );
      await log({
        actorId: user.id,
        action: 'template.updated',
        entityType: 'template',
        entityId: id,
        summary:
          input.mode && input.mode !== t.mode
            ? `${user.name} set the “${t.name}” automation to ${input.mode.toLowerCase()}`
            : `${user.name} edited the “${t.name}” template`,
      });
    });
    const row = await this.database.models.MessageTemplate.findById(id).lean<MessageTemplate>();
    return this.templateView(row!);
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  /** Values for every placeholder the referenced records can fill, and who receives it. */
  async context(refs: MessageRefs, channel: MessageChannel, senderName: string | null) {
    const {
      Client: Clients,
      Project: Projects,
      Shoot: Shoots,
      Script: Scripts,
      Deliverable: Deliverables,
      ClientContact,
    } = this.database.models;
    const [shoot, script, deliverable] = await Promise.all([
      refs.shootId ? Shoots.findById(refs.shootId).lean<Shoot>() : null,
      refs.scriptId ? Scripts.findById(refs.scriptId).lean<Script>() : null,
      refs.deliverableId ? Deliverables.findById(refs.deliverableId).lean<Deliverable>() : null,
    ]);
    const projectId =
      refs.projectId ?? shoot?.projectId ?? script?.projectId ?? deliverable?.projectId ?? null;
    const project = projectId ? await Projects.findById(projectId).lean<Project>() : null;
    const clientId = refs.clientId ?? project?.clientId ?? null;
    const client = clientId ? await Clients.findById(clientId).lean<Client>() : null;
    const contact = clientId
      ? await ClientContact.findOne({ clientId })
          .sort({ isPrimary: -1, createdAt: 1 })
          .lean<ClientContact>()
      : null;
    const contactName = contact?.name ?? client?.contactName ?? null;
    const address =
      channel === 'EMAIL'
        ? (contact?.email ?? client?.contactEmail ?? null)
        : (contact?.phone ?? client?.contactPhone ?? null);
    const days = shoot ? shootDayKeys(shoot.startsAt, shoot.endsAt) : [];
    const reviewBase = process.env.REVIEW_LINK_BASE?.replace(/\/$/, '');
    const values: Partial<Record<TemplateVariable, string | null>> = {
      client: client?.name,
      contact: contactName ?? (client ? `${client.name} team` : null),
      project: project?.title,
      projectCode: project?.code,
      studio: process.env.STUDIO_NAME?.trim() || 'Neon Minds',
      shoot: shoot?.title,
      shootDate: shoot
        ? days.length > 1
          ? `${dayFmt(shoot.startsAt)} – ${dayFmt(shoot.endsAt)} (${days.length} days)`
          : dayFmt(shoot.startsAt)
        : null,
      callTime: shoot ? (shoot.callTime ?? shoot.crewCallTime ?? null) : null,
      location: shoot?.location,
      oldDate: refs.oldDate ? dayFmt(refs.oldDate) : null,
      script: script ? `${script.title} (v${script.currentVersion})` : null,
      deliverable: deliverable ? `${deliverable.name} v${deliverable.currentVersion}` : null,
      // There is no client review portal; a link appears only when the studio configures one.
      reviewLink: reviewBase && deliverable ? `${reviewBase}/${deliverable.id}` : null,
      dueDate: project ? dayFmt(project.dueDate) : null,
      sender: senderName ?? 'The production team',
    };
    return {
      client,
      project,
      shoot,
      values,
      recipient: client ? { name: contactName ?? client.name, address, channel } : null,
    };
  }

  async preview(input: PreviewMessage, user: SessionUser): Promise<MessagePreview> {
    await this.ensureTemplates();
    const template = await this.database.models.MessageTemplate.findOne({
      trigger: input.trigger,
    }).lean<MessageTemplate>();
    const channel = template?.channel ?? 'EMAIL';
    const ctx = await this.context(input, channel, user.name);
    const subject = renderTemplate(input.subject ?? template?.subject ?? '', ctx.values);
    const body = renderTemplate(input.body ?? template?.body ?? '', ctx.values);
    return {
      subject: subject.text,
      body: body.text,
      missing: [...new Set([...subject.missing, ...body.missing])],
      recipient: ctx.recipient,
    };
  }

  /**
   * Prepares an automated message from the trigger's template. Returns null when the automation
   * is off, the client is unknown, or the same message was already prepared (`dedupeKey`).
   */
  async prepare(
    trigger: Exclude<MessageTrigger, 'MANUAL'>,
    refs: MessageRefs,
    opts: {
      dedupeKey: string;
      scheduledFor?: Date | null;
      scheduleStamp?: Date | null;
      actor?: { id: string; name: string } | null;
    },
  ): Promise<ClientMessage | null> {
    await this.ensureTemplates();
    const { MessageTemplate: Templates, ClientMessage: Messages } = this.database.models;
    if (await Messages.exists({ dedupeKey: opts.dedupeKey })) return null;
    const template = await Templates.findOne({ trigger }).lean<MessageTemplate>();
    if (!template || template.mode === 'OFF') return null;
    const ctx = await this.context(refs, template.channel, opts.actor?.name ?? null);
    if (!ctx.client || !ctx.recipient) return null;
    const subject = renderTemplate(template.subject, ctx.values);
    const body = renderTemplate(template.body, ctx.values);
    const missing = [...new Set([...subject.missing, ...body.missing])];
    const auto = template.mode === 'AUTO' && missing.length === 0 && !!ctx.recipient.address;
    const statusNote = auto
      ? 'Queued automatically by the automation rule.'
      : template.mode === 'AUTO'
        ? `Held as a draft: ${missing.length ? `fill ${missing.map((m) => `[${m}]`).join(', ')}` : 'the client has no contact address on file'} before it can go out.`
        : 'Prepared automatically — review before sending.';
    try {
      const row = (
        await Messages.create({
          clientId: ctx.client.id,
          projectId: ctx.project?.id ?? null,
          shootId: ctx.shoot?.id ?? null,
          templateId: template.id,
          trigger,
          channel: template.channel,
          recipientName: ctx.recipient.name,
          recipientAddress: ctx.recipient.address,
          subject: subject.text,
          body: body.text,
          status: auto ? 'QUEUED' : 'DRAFT',
          scheduledFor: opts.scheduledFor ?? null,
          statusNote,
          dedupeKey: opts.dedupeKey,
          scheduleStamp: opts.scheduleStamp ?? null,
          createdById: null,
        })
      ).toObject<ClientMessage>();
      await this.activity.log({
        actorId: null,
        source: 'SYSTEM',
        action: 'message.prepared',
        entityType: 'message',
        entityId: row.id,
        projectId: row.projectId,
        summary: `Automation prepared “${MESSAGE_TRIGGER_LABELS[trigger]}” for ${ctx.client.name}${auto ? ' (queued)' : ' (draft for review)'}`,
      });
      return row;
    } catch (error) {
      if (isDuplicateKeyError(error)) return null; // a concurrent event prepared it first
      throw error;
    }
  }

  // ── Messages ────────────────────────────────────────────────────────────────

  private view(m: MessageRow, people: Map<string, string>): MessageView {
    return {
      id: m.id,
      trigger: m.trigger,
      channel: m.channel,
      status: m.status,
      client: { id: m.clientId, name: m.client?.name ?? 'Unknown client' },
      project: m.project
        ? { id: m.project.id, code: m.project.code, title: m.project.title }
        : null,
      shoot: m.shoot ? { id: m.shoot.id, title: m.shoot.title } : null,
      recipientName: m.recipientName,
      recipientAddress: m.recipientAddress,
      subject: m.subject,
      body: m.body,
      unfilled: OPEN.includes(m.status) ? unfilledIn(m.subject, m.body) : [],
      scheduledFor: isoOrNull(m.scheduledFor),
      sentAt: isoOrNull(m.sentAt),
      statusNote: m.statusNote,
      provider: m.provider,
      automated: !m.createdById,
      createdBy: m.createdById ? (people.get(m.createdById) ?? null) : 'Automation',
      reviewedBy: m.reviewedById ? (people.get(m.reviewedById) ?? null) : null,
      createdAt: iso(m.createdAt),
      updatedAt: iso(m.updatedAt),
    };
  }

  private async views(rows: MessageRow[]): Promise<MessageView[]> {
    const ids = [
      ...new Set(
        rows.flatMap((r) => [r.createdById, r.reviewedById]).filter((x): x is string => !!x),
      ),
    ];
    const users = await this.database.models.User.find({ _id: { $in: ids } }, { name: 1 }).lean<
      Pick<User, '_id' | 'name'>[]
    >();
    const people = new Map(users.map((u) => [u._id, u.name]));
    return rows.map((r) => this.view(r, people));
  }

  private populate = [
    { path: 'client', select: { name: 1 } },
    { path: 'project', select: { code: 1, title: 1 } },
    { path: 'shoot', select: { title: 1 } },
  ];

  async get(id: string): Promise<MessageView> {
    const row = await this.database.models.ClientMessage.findById(id)
      .populate(this.populate)
      .lean<MessageRow>();
    if (!row) throw notFound('Message');
    return (await this.views([row]))[0]!;
  }

  async overview(q: MessageQuery): Promise<CommunicationsOverview> {
    await this.ensureTemplates();
    await this.dispatchDue();
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.clientId) where.clientId = q.clientId;
    if (q.projectId) where.projectId = q.projectId;
    if (q.trigger) where.trigger = q.trigger;
    const base: Record<string, unknown> = { ...where };
    delete base.status;
    const [rows, grouped] = await Promise.all([
      this.database.models.ClientMessage.find(where)
        .sort({ createdAt: -1 })
        .limit(200)
        .populate(this.populate)
        .lean<MessageRow[]>(),
      this.database.models.ClientMessage.aggregate<{ _id: MessageStatus; n: number }>([
        { $match: base },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
    ]);
    const counts = Object.fromEntries(MESSAGE_STATUSES.map((s) => [s, 0])) as Record<
      MessageStatus,
      number
    >;
    for (const g of grouped) counts[g._id] = g.n;
    return { messages: await this.views(rows), counts, delivery: this.delivery() };
  }

  async compose(input: ComposeMessage, user: SessionUser): Promise<MessageView> {
    const client = await this.database.models.Client.findById(input.clientId).lean<Client>();
    if (!client) throw unprocessable('INVALID_CLIENT', 'Choose an existing client.');
    if (input.projectId) {
      const p = await this.database.models.Project.findById(input.projectId).lean<Project>();
      if (!p || p.clientId !== client.id)
        throw unprocessable('INVALID_PROJECT', 'The project belongs to another client.');
    }
    const row = await this.activity.transaction(async (log) => {
      const m = (
        await this.database.models.ClientMessage.create({
          ...input,
          projectId: input.projectId ?? null,
          shootId: input.shootId ?? null,
          recipientAddress: input.recipientAddress ?? null,
          scheduledFor: input.scheduledFor ?? null,
          status: 'DRAFT',
          statusNote: 'Draft written by hand.',
          createdById: user.id,
        })
      ).toObject<ClientMessage>();
      await log({
        actorId: user.id,
        action: 'message.drafted',
        entityType: 'message',
        entityId: m.id,
        projectId: m.projectId,
        summary: `${user.name} drafted “${m.subject}” to ${client.name}`,
      });
      return m;
    });
    return this.get(row.id);
  }

  async update(id: string, input: UpdateMessage, user: SessionUser): Promise<MessageView> {
    const m = await this.database.models.ClientMessage.findById(id).lean<ClientMessage>();
    if (!m) throw notFound('Message');
    if (!OPEN.includes(m.status)) {
      throw conflict(
        'MESSAGE_CLOSED',
        `This message is ${m.status.toLowerCase()} and can no longer be edited.`,
      );
    }
    const res = await this.database.models.ClientMessage.updateOne(
      { _id: id, status: { $in: OPEN } },
      // Editing a queued message takes it back to draft: it must be reviewed again.
      { $set: { ...input, status: 'DRAFT', statusNote: `Edited by ${user.name}.` } },
    );
    if (res.matchedCount === 0)
      throw conflict('MESSAGE_CLOSED', 'This message was sent or cancelled meanwhile.');
    return this.get(id);
  }

  /** Approves a message: queues it for its send time, or delivers it now. */
  async send(id: string, user: SessionUser): Promise<MessageView> {
    const m = await this.database.models.ClientMessage.findById(id).lean<ClientMessage>();
    if (!m) throw notFound('Message');
    if (!OPEN.includes(m.status))
      throw conflict('MESSAGE_CLOSED', `This message is already ${m.status.toLowerCase()}.`);
    const unfilled = unfilledIn(m.subject, m.body);
    if (unfilled.length) {
      throw unprocessable(
        'UNFILLED_PLACEHOLDERS',
        `Fill ${unfilled.map((u) => `[${u}]`).join(', ')} before sending.`,
        { unfilled },
      );
    }
    if (!m.recipientAddress) {
      throw unprocessable(
        'NO_RECIPIENT',
        m.channel === 'EMAIL'
          ? 'Add the recipient’s email address.'
          : 'Add the recipient’s WhatsApp number.',
      );
    }
    const later = m.scheduledFor && m.scheduledFor.getTime() > Date.now();
    const res = await this.database.models.ClientMessage.updateOne(
      { _id: id, status: { $in: OPEN } },
      {
        $set: {
          status: 'QUEUED',
          reviewedById: user.id,
          statusNote: later
            ? `Approved by ${user.name}; queued for its send time.`
            : `Approved by ${user.name}.`,
        },
      },
    );
    if (res.matchedCount === 0)
      throw conflict('MESSAGE_CLOSED', 'This message was sent or cancelled meanwhile.');
    if (!later) await this.dispatch(id, user);
    else
      await this.activity.log({
        actorId: user.id,
        action: 'message.queued',
        entityType: 'message',
        entityId: id,
        projectId: m.projectId,
        summary: `${user.name} queued “${m.subject}” for ${isoOrNull(m.scheduledFor)?.slice(0, 16).replace('T', ' ')} UTC`,
      });
    return this.get(id);
  }

  async cancel(id: string, user: SessionUser): Promise<MessageView> {
    const m = await this.database.models.ClientMessage.findById(id).lean<ClientMessage>();
    if (!m) throw notFound('Message');
    const res = await this.database.models.ClientMessage.updateOne(
      { _id: id, status: { $in: OPEN } },
      {
        $set: {
          status: 'CANCELLED',
          statusNote: `Cancelled by ${user.name}.`,
          reviewedById: user.id,
        },
      },
    );
    if (res.matchedCount === 0)
      throw conflict('MESSAGE_CLOSED', `This message is already ${m.status.toLowerCase()}.`);
    await this.activity.log({
      actorId: user.id,
      action: 'message.cancelled',
      entityType: 'message',
      entityId: id,
      projectId: m.projectId,
      summary: `${user.name} cancelled “${m.subject}” to ${m.recipientName}`,
    });
    return this.get(id);
  }

  /** Cancels unsent messages of a shoot (cancelled, or superseded by a move). */
  async cancelOpenForShoot(shootId: string, note: string, filter: Record<string, unknown> = {}) {
    await this.database.models.ClientMessage.updateMany(
      { shootId, status: { $in: OPEN }, ...filter },
      { $set: { status: 'CANCELLED', statusNote: note } },
    );
  }

  /** Delivers every queued message whose time has come. Throttled to once per 20 seconds. */
  async dispatchDue(force = false): Promise<number> {
    if (!force && Date.now() - this.lastDue < 20_000) return 0;
    this.lastDue = Date.now();
    const due = await this.database.models.ClientMessage.find(
      { status: 'QUEUED', $or: [{ scheduledFor: null }, { scheduledFor: { $lte: new Date() } }] },
      { _id: 1 },
    )
      .limit(50)
      .lean();
    for (const d of due) await this.dispatch(d._id, null);
    return due.length;
  }

  /** Hands one queued message to its channel. Never claims a send that did not happen. */
  private async dispatch(id: string, user: { id: string; name: string } | null) {
    const { ClientMessage: Messages } = this.database.models;
    // Claim it: of two dispatchers only one moves it out of QUEUED.
    const m = await Messages.findOneAndUpdate(
      { _id: id, status: 'QUEUED' },
      { $set: { statusNote: 'Sending…' } },
      { returnDocument: 'after' },
    ).lean<ClientMessage>();
    if (!m) return;
    let status: MessageStatus;
    let provider: string;
    let note: string;
    const delivery = this.delivery();
    if (m.channel === 'EMAIL' && delivery.email.ready) {
      provider = 'resend';
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.MAIL_FROM,
            to: [m.recipientAddress],
            subject: m.subject,
            text: m.body,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
        if (res.ok) {
          status = 'SENT';
          note = `Accepted by Resend${body.id ? ` (id ${body.id})` : ''}.`;
        } else {
          status = 'FAILED';
          note = `Resend refused the message (${res.status}${body.message ? `: ${body.message}` : ''}).`;
        }
      } catch (error) {
        status = 'FAILED';
        note = `Could not reach Resend: ${error instanceof Error ? error.message : 'network error'}.`;
      }
    } else {
      status = 'SIMULATED';
      provider = 'simulated';
      note = m.channel === 'EMAIL' ? delivery.email.note : delivery.whatsapp.note;
    }
    await Messages.updateOne(
      { _id: id },
      {
        $set: {
          status,
          provider,
          statusNote: note,
          sentAt: status === 'FAILED' ? null : new Date(),
        },
      },
    );
    if (status === 'SENT') {
      // A real send is part of the client's communication history.
      await this.database.models.ClientInteraction.create({
        clientId: m.clientId,
        projectId: m.projectId,
        type: m.channel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP',
        summary: `Sent: ${m.subject}`,
        occurredAt: new Date(),
        loggedById: user?.id ?? m.reviewedById ?? m.createdById,
      }).catch((error: unknown) => this.logger.warn(`Interaction not logged: ${String(error)}`));
    }
    await this.activity.log({
      actorId: user?.id ?? null,
      source: user ? 'UI' : 'SYSTEM',
      action: `message.${status.toLowerCase()}`,
      entityType: 'message',
      entityId: id,
      projectId: m.projectId,
      summary:
        status === 'SENT'
          ? `Sent “${m.subject}” to ${m.recipientName}`
          : status === 'FAILED'
            ? `Sending “${m.subject}” to ${m.recipientName} failed`
            : `Simulated sending “${m.subject}” to ${m.recipientName} (no ${m.channel === 'EMAIL' ? 'email provider' : 'WhatsApp integration'} configured)`,
    });
  }
}
