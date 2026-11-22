import { Injectable } from '@nestjs/common';
import type {
  ContactView,
  ConvertLead,
  CreateContact,
  ProjectDetail,
  SessionUser,
  UpdateLeadOwnership,
} from '@nova/shared';
import type { Client, ClientContact, Lead, User } from '@nova/db';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
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
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
    private readonly projects: ProjectsService,
  ) {}

  async contacts(clientId: string): Promise<ContactView[]> {
    const { Client: Clients, ClientContact: Contacts } = this.database.models;
    if (!(await Clients.exists({ _id: clientId }))) {
      throw notFound('Client');
    }
    const rows = await Contacts.find({ clientId })
      .sort({ isPrimary: -1, name: 1 })
      .lean<ClientContact[]>();
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
    const { Client: Clients, ClientContact: Contacts } = this.database.models;
    const client = await Clients.findById(clientId).lean<Client>();
    if (!client) throw notFound('Client');
    await this.activity.transaction(async (log) => {
      if (input.isPrimary) {
        await Contacts.updateMany({ clientId }, { $set: { isPrimary: false } });
        // Keep the client's headline contact in step with the primary contact.
        const res = await Clients.updateOne(
          { _id: clientId },
          {
            $set: {
              contactName: input.name,
              contactEmail: input.email,
              contactPhone: input.phone,
            },
          },
        );
        if (res.matchedCount === 0) throw notFound('Client');
      }
      const c = (await Contacts.create({ ...input, clientId })).toObject() as ClientContact;
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
    const { ClientContact: Contacts } = this.database.models;
    const c = await Contacts.findOne({ _id: contactId, clientId })
      .populate('client')
      .lean<ClientContact & { client: Client | null }>();
    if (!c) throw notFound('Contact');
    await this.activity.transaction(async (log) => {
      const res = await Contacts.deleteOne({ _id: contactId });
      if (res.deletedCount === 0) throw notFound('Contact');
      await log({
        actorId: user.id,
        action: 'client.contact_removed',
        entityType: 'client',
        entityId: clientId,
        summary: `${user.name} removed contact ${c.name} from ${c.client?.name ?? ''}`,
      });
    });
    return this.contacts(clientId);
  }

  async updateOwnership(leadId: string, input: UpdateLeadOwnership, user: SessionUser) {
    const { Lead: Leads, User: Users } = this.database.models;
    const lead = await Leads.findById(leadId).lean<Lead>();
    if (!lead) throw notFound('Lead');
    let ownerName: string | null = null;
    if (input.ownerId) {
      const owner = await Users.findById(input.ownerId).lean<User>();
      if (!owner?.isActive) throw unprocessable('INVALID_OWNER', 'Choose an active user.');
      ownerName = owner.name;
    }
    await this.activity.transaction(async (log) => {
      const res = await Leads.updateOne({ _id: leadId }, { $set: input });
      if (res.matchedCount === 0) throw notFound('Lead');
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
    const { Lead: Leads, Client: Clients } = this.database.models;
    const lead = await Leads.findById(leadId).lean<Lead>();
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
      const client = await Clients.create({
        name: lead.prospectName!,
        industry: input.newClient!.industry,
        city: input.newClient!.city,
        contactEmail: input.newClient!.contactEmail ?? null,
        status: 'ACTIVE',
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
      // Compensate: the brand-new client has nothing else pointing at it yet.
      if (createdClientId) await Clients.deleteOne({ _id: createdClientId });
      throw error;
    }

    const convertedClientId = clientId;
    await this.activity.transaction(async (log) => {
      // Claim the lead only if nothing converted it meanwhile.
      const claim = await Leads.updateMany(
        { _id: leadId, convertedProjectId: null },
        { $set: { stage: 'WON', clientId: convertedClientId, convertedProjectId: project.id } },
      );
      if (claim.matchedCount === 0)
        throw conflict('LEAD_CONVERTED', 'This lead is already a project.');
      const res = await Clients.updateOne(
        { _id: convertedClientId },
        { $set: { status: 'ACTIVE' } },
      );
      if (res.matchedCount === 0) throw notFound('Client');
      await log({
        actorId: user.id,
        action: 'lead.converted',
        entityType: 'lead',
        entityId: leadId,
        projectId: project.id,
        summary: `${user.name} converted lead “${lead.title}” into project ${project.code}${createdClientId ? ' and a new client' : ''}`,
      });
    });
    return this.projects.get(project.id, user);
  }
}
