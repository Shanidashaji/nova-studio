import { Controller, Get, Query } from '@nestjs/common';
import {
  PROJECT_TYPE_LABELS,
  SearchQuery,
  STAGE_LABELS,
  TASK_STATUS_LABELS,
  type SearchResult,
} from '@nova/shared';
import { RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type {
  Client as ClientRow,
  Project as ProjectRow,
  ProjectStage,
  Shoot as ShootRow,
  StageDefinition,
  Task as TaskRow,
  TeamMember as TeamMemberRow,
} from '@nova/db';
import { containsI } from '../../common/query';
import { DatabaseService } from '../../database/database.service';

/** Cross-entity search for the command palette and the assistant. */
@Controller('search')
export class SearchController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @RequirePermissions('workspace:read')
  async search(
    @Query(new ZodValidationPipe(SearchQuery)) { q }: SearchQuery,
  ): Promise<SearchResult[]> {
    const contains = containsI(q);
    const { Project, Task, Client, TeamMember, Asset, Shoot, Lead } = this.database.models;
    const [projects, tasks, clients, members, assets, shoots, leads] = await Promise.all([
      Project.find({ $or: [{ title: contains }, { code: contains }, { logline: contains }] })
        .limit(6)
        .populate([
          { path: 'client' },
          {
            path: 'stages',
            match: { status: { $in: ['ACTIVE', 'BLOCKED'] } },
            populate: { path: 'stageDefinition' },
          },
        ])
        .lean<
          (ProjectRow & {
            client: ClientRow | null;
            stages: (ProjectStage & { stageDefinition: StageDefinition | null })[];
          })[]
        >(),
      Task.find({ title: contains })
        .sort({ updatedAt: -1 })
        .limit(6)
        .populate([
          { path: 'project', select: { title: 1 } },
          { path: 'assignee', select: { name: 1 } },
        ])
        .lean<
          (TaskRow & {
            project: Pick<ProjectRow, 'id' | 'title'> | null;
            assignee: Pick<TeamMemberRow, 'name'> | null;
          })[]
        >(),
      Client.find({ $or: [{ name: contains }, { industry: contains }] })
        .limit(4)
        .lean(),
      TeamMember.find({ $or: [{ name: contains }, { title: contains }] })
        .limit(4)
        .lean(),
      Asset.find({ $or: [{ name: contains }, { serialTag: contains }] })
        .limit(4)
        .lean(),
      Shoot.find({ $or: [{ title: contains }, { location: contains }] })
        .limit(4)
        .populate({ path: 'project', select: { title: 1 } })
        .lean<(ShootRow & { project: Pick<ProjectRow, 'title'> | null })[]>(),
      Lead.find({ $or: [{ title: contains }, { prospectName: contains }] })
        .limit(4)
        .lean(),
    ]);
    return [
      ...projects.map((p) => ({
        type: 'project' as const,
        id: p.id,
        title: `${p.code} · ${p.title}`,
        subtitle: `${p.client?.name ?? ''} · ${p.stages[0]?.stageDefinition ? STAGE_LABELS[p.stages[0].stageDefinition.key] : p.status.toLowerCase()}`,
      })),
      ...clients.map((c) => ({
        type: 'client' as const,
        id: c.id,
        title: c.name,
        subtitle: `${c.industry} · ${c.city}`,
      })),
      ...members.map((m) => ({
        type: 'member' as const,
        id: m.id,
        title: m.name,
        subtitle: m.title,
      })),
      ...tasks.map((t) => ({
        type: 'task' as const,
        id: t.id,
        title: t.title,
        subtitle: `${t.project?.title ?? ''} · ${TASK_STATUS_LABELS[t.status]}${t.assignee ? ` · ${t.assignee.name}` : ''}`,
        projectId: t.projectId,
      })),
      ...shoots.map((s) => ({
        type: 'shoot' as const,
        id: s.id,
        title: s.title,
        subtitle: `${s.project?.title ?? ''} · ${s.location}`,
      })),
      ...assets.map((a) => ({
        type: 'asset' as const,
        id: a.id,
        title: a.name,
        subtitle: `${a.serialTag} · ${a.status.toLowerCase()}`,
      })),
      ...leads.map((l) => ({
        type: 'lead' as const,
        id: l.id,
        title: l.title,
        subtitle: `${PROJECT_TYPE_LABELS[l.projectType]} · ${l.stage.toLowerCase()}`,
      })),
    ];
  }
}
