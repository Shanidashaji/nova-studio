import { Injectable } from '@nestjs/common';
import type {
  ContactView,
  ConvertLead,
  CreateContact,
  ProjectDetail,
  SessionUser,
  UpdateLeadOwnership,
} from '@nova/shared';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ProjectsService } from '../projects/projects.service';

/** CRM additions: client contacts, lead ownership and follow-ups, and lead conversion. */
@Injectable()
export class CrmService {
  /**
   * Leads being converted right now. Project creation runs in its own transaction, so a
   * double-click is stopped here (one API instance — ADR-0006) and by the re-check below.
   */
  private readonly converting = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly projects: ProjectsService,
  ) {}

  async contacts(clientId: string): Promise<ContactView[]> {
    if (!(await this.prisma.db.client.findUnique({ where: { id: clientId } }))) {
      throw notFound('Client');
    }
    const rows = await this.prisma.db.clientContact.findMany({
      where: { clientId },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      email: c.email,
      phone: c.phone,
      isPrimary: c.isPrimary,
    }));
  }

  async addContact(clientId: string, input: CreateContact, user: SessionUser) {
    const client = await this.prisma.db.client.findUnique({ where: { id: clientId } });
    if (!client) throw notFound('Client');
    await this.activity.transaction(async (tx, log) => {
      if (input.isPrimary) {
        await tx.clientContact.updateMany({ where: { clientId }, data: { isPrimary: false } });
        // Keep the client's headline contact in step with the primary contact.
        await tx.client.update({
          where: { id: clientId },
          data: { contactName: input.name, contactEmail: input.email, contactPhone: input.phone },
        });
      }
      const c = await tx.clientContact.create({ data: { ...input, clientId } });
      await log({
        actorId: user.id,
        action: 'client.contact_added',
        entityType: 'client',
        entityId: clientId,
        summary: `${user.name} added contact ${c.name}${c.role ? ` (${c.role})` : ''} at ${client.name}`,
      });
    });
    return this.contacts(clientId);
  }

  async removeContact(clientId: string, contactId: string, user: SessionUser) {
    const c = await this.prisma.db.clientContact.findFirst({
      where: { id: contactId, clientId },
      include: { client: true },
    });
    if (!c) throw notFound('Contact');
    await this.activity.transaction(async (tx, log) => {
      await tx.clientContact.delete({ where: { id: contactId } });
      await log({
        actorId: user.id,
        action: 'client.contact_removed',
        entityType: 'client',
        entityId: clientId,
        summary: `${user.name} removed contact ${c.name} from ${c.client.name}`,
      });
    });
    return this.contacts(clientId);
  }

  async updateOwnership(leadId: string, input: UpdateLeadOwnership, user: SessionUser) {
    const lead = await this.prisma.db.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw notFound('Lead');
    let ownerName: string | null = null;
    if (input.ownerId) {
      const owner = await this.prisma.db.user.findUnique({ where: { id: input.ownerId } });
      if (!owner?.isActive) throw unprocessable('INVALID_OWNER', 'Choose an active user.');
      ownerName = owner.name;
    }
    await this.activity.transaction(async (tx, log) => {
      await tx.lead.update({ where: { id: leadId }, data: input });
      const parts = [
        input.ownerId !== undefined ? (ownerName ? `owner ${ownerName}` : 'unassigned') : null,
        input.nextFollowUpAt !== undefined
          ? input.nextFollowUpAt
            ? `follow up ${input.nextFollowUpAt.toISOString().slice(0, 10)}`
            : 'follow-up cleared'
          : null,
      ].filter(Boolean);
      await log({
        actorId: user.id,
        action: 'lead.updated',
        entityType: 'lead',
        entityId: leadId,
        summary: `${user.name} updated lead “${lead.title}”${parts.length ? `: ${parts.join(', ')}` : ''}`,
      });
    });
    return { id: leadId };
  }

  /**
   * Converts a lead into a project (creating the client first for a prospect). Project creation
   * has its own transaction; a client created here is removed again if that step fails.
   */
  async convert(leadId: string, input: ConvertLead, user: SessionUser): Promise<ProjectDetail> {
    if (this.converting.has(leadId)) {
      throw conflict('LEAD_CONVERTING', 'This lead is already being converted.');
    }
    this.converting.add(leadId);
    try {
      return await this.convertOnce(leadId, input, user);
    } finally {
      this.converting.delete(leadId);
    }
  }

  private async convertOnce(
    leadId: string,
    input: ConvertLead,
    user: SessionUser,
  ): Promise<ProjectDetail> {
    const lead = await this.prisma.db.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw notFound('Lead');
    if (lead.convertedProjectId)
      throw conflict('LEAD_CONVERTED', 'This lead is already a project.');
    if (lead.stage === 'LOST') throw conflict('LEAD_LOST', 'A lost lead cannot be converted.');
    if (!lead.clientId && !input.newClient) {
      throw unprocessable('CLIENT_DETAILS_REQUIRED', 'Add the new client’s industry and city.');
    }

    let clientId = lead.clientId;
    let createdClientId: string | null = null;
    if (!clientId) {
      const client = await this.prisma.db.client.create({
        data: {
          name: lead.prospectName!,
          industry: input.newClient!.industry,
          city: input.newClient!.city,
          contactEmail: input.newClient!.contactEmail,
          status: 'ACTIVE',
        },
      });
      clientId = createdClientId = client.id;
    }

    let project: ProjectDetail;
    try {
      project = await this.projects.create(
        {
          title: input.title,
          clientId,
          type: input.type,
          workflowTemplateId: input.workflowTemplateId,
          priority: input.priority,
          location: input.location,
          startDate: input.startDate,
          dueDate: input.dueDate,
          budget: input.budget,
          includedRevisions: 2,
          aiAssisted: false,
          logline: lead.notes ?? undefined,
        },
        user,
      );
    } catch (error) {
      if (createdClientId) await this.prisma.db.client.delete({ where: { id: createdClientId } });
      throw error;
    }

    await this.activity.transaction(async (tx, log) => {
      // Claim the lead only if nothing converted it meanwhile.
      const { count } = await tx.lead.updateMany({
        where: { id: leadId, convertedProjectId: null },
        data: { stage: 'WON', clientId, convertedProjectId: project.id },
      });
      if (count === 0) throw conflict('LEAD_CONVERTED', 'This lead is already a project.');
      await tx.client.update({ where: { id: clientId }, data: { status: 'ACTIVE' } });
      await log({
        actorId: user.id,
        action: 'lead.converted',
        entityType: 'lead',
        entityId: leadId,
        projectId: project.id,
        summary: `${user.name} converted lead “${lead.title}” into project ${project.code}${createdClientId ? ' and a new client' : ''}`,
      });
    });
    return this.projects.get(project.id);
  }
}
