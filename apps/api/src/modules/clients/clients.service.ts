import { Injectable } from '@nestjs/common';
import {
  canSeeProjectMoney,
  PROJECT_TYPE_LABELS,
  type ClientDetail,
  type ClientView,
  type CreateClient,
  type CreateLead,
  type LeadView,
  type LogInteraction,
  type SessionUser,
  type UpdateLead,
} from '@nova/shared';
import type {
  Approval,
  Client,
  ClientInteraction,
  Deliverable,
  Lead,
  PopulateOptions,
  Project,
  ProjectStage,
  User,
} from '@nova/db';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { equalsI } from '../../common/query';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import {
  iso,
  isoOrNull,
  summaryFor,
  summaryPopulate,
  toSummary,
  type SummaryRow,
  type Viewer,
} from '../projects/project.mapper';

const leadPopulate: PopulateOptions[] = [
  { path: 'client', select: { name: 1, accentColor: 1 } },
  { path: 'convertedProject', select: { code: 1, title: 1 } },
];

type LeadRow = Lead & {
  client: Pick<Client, 'id' | 'name' | 'accentColor'> | null;
  convertedProject: Pick<Project, 'id' | 'code' | 'title'> | null;
};

const toLead = (l: LeadRow): LeadView => ({
  id: l.id,
  title: l.title,
  client: l.client
    ? { id: l.client.id, name: l.client.name, accentColor: l.client.accentColor }
    : null,
  prospectName: l.prospectName,
  projectType: l.projectType,
  estimatedValue: l.estimatedValue,
  stage: l.stage,
  source: l.source,
  expectedCloseDate: isoOrNull(l.expectedCloseDate),
  notes: l.notes,
  convertedProject: l.convertedProject
    ? { id: l.convertedProject.id, code: l.convertedProject.code, title: l.convertedProject.title }
    : null,
  updatedAt: iso(l.updatedAt),
});

// List virtuals: the selects keep the foreign field (`clientId`) so populate can match rows.
const clientPopulate: PopulateOptions[] = [
  { path: 'projects', select: { status: 1, budget: 1, clientId: 1 } },
  {
    path: 'interactions',
    select: { occurredAt: 1, clientId: 1 },
    options: { sort: { occurredAt: -1 } },
    perDocumentLimit: 1,
  },
];

type ClientRow = Client & {
  projects: Pick<Project, 'status' | 'budget'>[];
  interactions: Pick<ClientInteraction, 'occurredAt'>[];
};

type PendingApprovalRow = Approval & {
  deliverable: (Deliverable & { project: Pick<Project, 'clientId'> | null }) | null;
  projectStage: (ProjectStage & { project: Pick<Project, 'clientId'> | null }) | null;
};

type InteractionRow = ClientInteraction & {
  project: Pick<Project, 'id' | 'code' | 'title'> | null;
  loggedBy: Pick<User, 'name'> | null;
};

@Injectable()
export class ClientsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
  ) {}

  private async pendingApprovalsByClient(): Promise<Map<string, number>> {
    const pending = await this.database.models.Approval.find({ status: 'PENDING', kind: 'CLIENT' })
      .select({ deliverableId: 1, projectStageId: 1 })
      .populate([
        {
          path: 'deliverable',
          select: { projectId: 1 },
          populate: { path: 'project', select: { clientId: 1 } },
        },
        {
          path: 'projectStage',
          select: { projectId: 1 },
          populate: { path: 'project', select: { clientId: 1 } },
        },
      ])
      .lean<PendingApprovalRow[]>();
    const map = new Map<string, number>();
    for (const a of pending) {
      const clientId = a.deliverable?.project?.clientId ?? a.projectStage?.project?.clientId;
      if (clientId) map.set(clientId, (map.get(clientId) ?? 0) + 1);
    }
    return map;
  }

  /** `viewer` decides whether the lifetime value is included (`canSeeProjectMoney`). */
  private toView(c: ClientRow, pending: Map<string, number>, viewer: Viewer): ClientView {
    return {
      id: c.id,
      name: c.name,
      accentColor: c.accentColor,
      industry: c.industry,
      city: c.city,
      status: c.status,
      contactName: c.contactName,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      activeProjects: c.projects.filter((p) => p.status === 'ACTIVE' || p.status === 'ON_HOLD')
        .length,
      lifetimeValue: canSeeProjectMoney(viewer.permissions)
        ? c.projects.filter((p) => p.status !== 'CANCELLED').reduce((n, p) => n + p.budget, 0)
        : null,
      pendingApprovals: pending.get(c.id) ?? 0,
      lastInteractionAt: isoOrNull(c.interactions[0]?.occurredAt),
    };
  }

  async list(viewer: Viewer): Promise<ClientView[]> {
    const [clients, pending] = await Promise.all([
      this.database.models.Client.find()
        .sort({ name: 1 })
        .populate(clientPopulate)
        .lean<ClientRow[]>(),
      this.pendingApprovalsByClient(),
    ]);
    return clients.map((c) => this.toView(c, pending, viewer));
  }

  async get(id: string, viewer: Viewer): Promise<ClientDetail> {
    const {
      Client: Clients,
      Project: Projects,
      ClientInteraction: Interactions,
    } = this.database.models;
    const [client, pending] = await Promise.all([
      Clients.findById(id)
        .populate([
          ...clientPopulate,
          { path: 'leads', options: { sort: { updatedAt: -1 } }, populate: leadPopulate },
        ])
        .lean<ClientRow & { leads: LeadRow[] }>(),
      this.pendingApprovalsByClient(),
    ]);
    if (!client) throw notFound('Client');
    const [projects, interactions] = await Promise.all([
      Projects.find({ clientId: id })
        .sort({ dueDate: -1 })
        .populate(summaryPopulate)
        .lean<SummaryRow[]>(),
      Interactions.find({ clientId: id })
        .sort({ occurredAt: -1 })
        .populate([
          { path: 'project', select: { code: 1, title: 1 } },
          { path: 'loggedBy', select: { name: 1 } },
        ])
        .lean<InteractionRow[]>(),
    ]);
    const now = new Date();
    return {
      ...this.toView(client, pending, viewer),
      notes: client.notes,
      projects: projects.map((p) => summaryFor(toSummary(p, now), viewer)),
      interactions: interactions.map((i) => ({
        id: i.id,
        type: i.type,
        summary: i.summary,
        occurredAt: iso(i.occurredAt),
        project: i.project
          ? { id: i.project.id, code: i.project.code, title: i.project.title }
          : null,
        loggedBy: i.loggedBy?.name ?? null,
      })),
      leads: client.leads.map(toLead),
    };
  }

  async create(input: CreateClient, user: SessionUser): Promise<ClientDetail> {
    const { Client: Clients } = this.database.models;
    const duplicate = await Clients.findOne({ name: equalsI(input.name) })
      .select({ name: 1 })
      .lean<Pick<Client, 'name'>>();
    if (duplicate) {
      throw conflict('CLIENT_EXISTS', `A client named ${duplicate.name} already exists.`);
    }
    const row = await this.database.transaction(async () => {
      const client = (await Clients.create({ ...input, status: 'LEAD' })).toObject() as Client;
      const log = await this.activity.record({
        actorId: user.id,
        action: 'client.created',
        entityType: 'client',
        entityId: client.id,
        summary: `${user.name} added client ${client.name}`,
      });
      return { client, log };
    });
    this.activity.publish(row.log);
    return this.get(row.client.id, user);
  }

  async logInteraction(
    clientId: string,
    input: LogInteraction,
    user: SessionUser,
    source: 'UI' | 'ASSISTANT' = 'UI',
  ) {
    const {
      Client: Clients,
      Project: Projects,
      ClientInteraction: Interactions,
    } = this.database.models;
    const client = await Clients.findById(clientId).lean<Client>();
    if (!client) throw notFound('Client');
    if (input.projectId) {
      const project = await Projects.findOne({ _id: input.projectId, clientId })
        .select({ _id: 1 })
        .lean();
      if (!project)
        throw unprocessable('INVALID_PROJECT', 'That project does not belong to this client.');
    }
    const row = await this.database.transaction(async () => {
      const interaction = await Interactions.create({
        clientId,
        projectId: input.projectId ?? null,
        type: input.type,
        summary: input.summary,
        occurredAt: input.occurredAt ?? new Date(),
        loggedById: user.id,
      });
      const log = await this.activity.record({
        actorId: user.id,
        source,
        action: 'client.interaction',
        entityType: 'client',
        entityId: clientId,
        projectId: input.projectId ?? null,
        summary: `${user.name} logged a ${input.type.toLowerCase()} with ${client.name}: ${input.summary}`,
      });
      return { interactionId: interaction.id, log };
    });
    this.activity.publish(row.log);
    return { id: row.interactionId };
  }

  // ── Sales pipeline ─────────────────────────────────────────────────────────

  async leads(): Promise<LeadView[]> {
    const leads = await this.database.models.Lead.find()
      .sort({ updatedAt: -1 })
      .populate(leadPopulate)
      .lean<LeadRow[]>();
    return leads.map(toLead);
  }

  async createLead(input: CreateLead, user: SessionUser): Promise<LeadView> {
    const { Lead: Leads } = this.database.models;
    const row = await this.database.transaction(async () => {
      const created = await Leads.create(input);
      const lead = await Leads.findById(created.id).populate(leadPopulate).lean<LeadRow>();
      if (!lead) throw notFound('Lead');
      const log = await this.activity.record({
        actorId: user.id,
        action: 'lead.created',
        entityType: 'lead',
        entityId: lead.id,
        summary: `${user.name} added lead “${lead.title}” (${PROJECT_TYPE_LABELS[lead.projectType]})`,
      });
      return { lead, log };
    });
    this.activity.publish(row.log);
    return toLead(row.lead);
  }

  async updateLead(id: string, input: UpdateLead, user: SessionUser): Promise<LeadView> {
    const { Lead: Leads } = this.database.models;
    const before = await Leads.findById(id).lean<Lead>();
    if (!before) throw notFound('Lead');
    // A converted lead is a won deal with a production behind it; its stage is history.
    if (before.convertedProjectId && input.stage && input.stage !== before.stage) {
      throw unprocessable(
        'LEAD_CONVERTED',
        'This lead has been converted to a production; its stage can no longer change.',
      );
    }
    const row = await this.database.transaction(async () => {
      const lead = await Leads.findByIdAndUpdate(id, { $set: input }, { new: true })
        .populate(leadPopulate)
        .lean<LeadRow>();
      if (!lead) throw notFound('Lead');
      const log = await this.activity.record({
        actorId: user.id,
        action: 'lead.updated',
        entityType: 'lead',
        entityId: id,
        summary:
          input.stage && input.stage !== before.stage
            ? `${user.name} moved lead “${before.title}” to ${input.stage.toLowerCase()}`
            : `${user.name} updated lead “${before.title}”`,
      });
      return { lead, log };
    });
    this.activity.publish(row.log);
    return toLead(row.lead);
  }
}
