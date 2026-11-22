import { Injectable } from '@nestjs/common';
import {
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
import type { Prisma } from '@nova/db';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { iso, isoOrNull, summaryInclude, toSummary } from '../projects/project.mapper';

const leadInclude = {
  client: { select: { id: true, name: true, accentColor: true } },
  convertedProject: { select: { id: true, code: true, title: true } },
} satisfies Prisma.LeadInclude;

const toLead = (l: Prisma.LeadGetPayload<{ include: typeof leadInclude }>): LeadView => ({
  id: l.id,
  title: l.title,
  client: l.client,
  prospectName: l.prospectName,
  projectType: l.projectType,
  estimatedValue: l.estimatedValue,
  stage: l.stage,
  source: l.source,
  expectedCloseDate: isoOrNull(l.expectedCloseDate),
  notes: l.notes,
  convertedProject: l.convertedProject,
  updatedAt: iso(l.updatedAt),
});

const clientInclude = {
  projects: { select: { status: true, budget: true } },
  interactions: { select: { occurredAt: true }, orderBy: { occurredAt: 'desc' }, take: 1 },
} satisfies Prisma.ClientInclude;

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  private async pendingApprovalsByClient(): Promise<Map<string, number>> {
    const pending = await this.prisma.db.approval.findMany({
      where: { status: 'PENDING', kind: 'CLIENT' },
      select: {
        deliverable: { select: { project: { select: { clientId: true } } } },
        projectStage: { select: { project: { select: { clientId: true } } } },
      },
    });
    const map = new Map<string, number>();
    for (const a of pending) {
      const clientId = a.deliverable?.project.clientId ?? a.projectStage?.project.clientId;
      if (clientId) map.set(clientId, (map.get(clientId) ?? 0) + 1);
    }
    return map;
  }

  private toView(
    c: Prisma.ClientGetPayload<{ include: typeof clientInclude }>,
    pending: Map<string, number>,
  ): ClientView {
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
      lifetimeValue: c.projects
        .filter((p) => p.status !== 'CANCELLED')
        .reduce((n, p) => n + p.budget, 0),
      pendingApprovals: pending.get(c.id) ?? 0,
      lastInteractionAt: isoOrNull(c.interactions[0]?.occurredAt),
    };
  }

  async list(): Promise<ClientView[]> {
    const [clients, pending] = await Promise.all([
      this.prisma.db.client.findMany({ include: clientInclude, orderBy: { name: 'asc' } }),
      this.pendingApprovalsByClient(),
    ]);
    return clients.map((c) => this.toView(c, pending));
  }

  async get(id: string): Promise<ClientDetail> {
    const [client, pending] = await Promise.all([
      this.prisma.db.client.findUnique({
        where: { id },
        include: {
          ...clientInclude,
          leads: { include: leadInclude, orderBy: { updatedAt: 'desc' } },
        },
      }),
      this.pendingApprovalsByClient(),
    ]);
    if (!client) throw notFound('Client');
    const [projects, interactions] = await Promise.all([
      this.prisma.db.project.findMany({
        where: { clientId: id },
        include: summaryInclude,
        orderBy: { dueDate: 'desc' },
      }),
      this.prisma.db.clientInteraction.findMany({
        where: { clientId: id },
        include: {
          project: { select: { id: true, code: true, title: true } },
          loggedBy: { select: { name: true } },
        },
        orderBy: { occurredAt: 'desc' },
      }),
    ]);
    const now = new Date();
    return {
      ...this.toView(client, pending),
      notes: client.notes,
      projects: projects.map((p) => toSummary(p, now)),
      interactions: interactions.map((i) => ({
        id: i.id,
        type: i.type,
        summary: i.summary,
        occurredAt: iso(i.occurredAt),
        project: i.project,
        loggedBy: i.loggedBy?.name ?? null,
      })),
      leads: client.leads.map(toLead),
    };
  }

  async create(input: CreateClient, user: SessionUser): Promise<ClientDetail> {
    const duplicate = await this.prisma.db.client.findFirst({
      where: { name: { equals: input.name, mode: 'insensitive' } },
      select: { name: true },
    });
    if (duplicate) {
      throw conflict('CLIENT_EXISTS', `A client named ${duplicate.name} already exists.`);
    }
    const row = await this.prisma.db.$transaction(async (tx) => {
      const client = await tx.client.create({ data: { ...input, status: 'LEAD' } });
      const log = await this.activity.record(tx, {
        actorId: user.id,
        action: 'client.created',
        entityType: 'client',
        entityId: client.id,
        summary: `${user.name} added client ${client.name}`,
      });
      return { client, log };
    });
    this.activity.publish(row.log);
    return this.get(row.client.id);
  }

  async logInteraction(
    clientId: string,
    input: LogInteraction,
    user: SessionUser,
    source: 'UI' | 'ASSISTANT' = 'UI',
  ) {
    const client = await this.prisma.db.client.findUnique({ where: { id: clientId } });
    if (!client) throw notFound('Client');
    if (input.projectId) {
      const project = await this.prisma.db.project.findFirst({
        where: { id: input.projectId, clientId },
      });
      if (!project)
        throw unprocessable('INVALID_PROJECT', 'That project does not belong to this client.');
    }
    const row = await this.prisma.db.$transaction(async (tx) => {
      const interaction = await tx.clientInteraction.create({
        data: {
          clientId,
          projectId: input.projectId,
          type: input.type,
          summary: input.summary,
          occurredAt: input.occurredAt ?? new Date(),
          loggedById: user.id,
        },
      });
      const log = await this.activity.record(tx, {
        actorId: user.id,
        source,
        action: 'client.interaction',
        entityType: 'client',
        entityId: clientId,
        projectId: input.projectId ?? null,
        summary: `${user.name} logged a ${input.type.toLowerCase()} with ${client.name}: ${input.summary}`,
      });
      return { interaction, log };
    });
    this.activity.publish(row.log);
    return { id: row.interaction.id };
  }

  // ── Sales pipeline ─────────────────────────────────────────────────────────

  async leads(): Promise<LeadView[]> {
    const leads = await this.prisma.db.lead.findMany({
      include: leadInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return leads.map(toLead);
  }

  async createLead(input: CreateLead, user: SessionUser): Promise<LeadView> {
    const row = await this.prisma.db.$transaction(async (tx) => {
      const lead = await tx.lead.create({ data: input, include: leadInclude });
      const log = await this.activity.record(tx, {
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
    const before = await this.prisma.db.lead.findUnique({ where: { id } });
    if (!before) throw notFound('Lead');
    // A converted lead is a won deal with a production behind it; its stage is history.
    if (before.convertedProjectId && input.stage && input.stage !== before.stage) {
      throw unprocessable(
        'LEAD_CONVERTED',
        'This lead has been converted to a production; its stage can no longer change.',
      );
    }
    const row = await this.prisma.db.$transaction(async (tx) => {
      const lead = await tx.lead.update({ where: { id }, data: input, include: leadInclude });
      const log = await this.activity.record(tx, {
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
