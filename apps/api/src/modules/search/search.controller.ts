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
import { PrismaService } from '../../database/prisma.service';

/** Cross-entity search for the command palette and the assistant. */
@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('workspace:read')
  async search(
    @Query(new ZodValidationPipe(SearchQuery)) { q }: SearchQuery,
  ): Promise<SearchResult[]> {
    const contains = { contains: q, mode: 'insensitive' as const };
    const [projects, tasks, clients, members, assets, shoots, leads] = await Promise.all([
      this.prisma.db.project.findMany({
        where: { OR: [{ title: contains }, { code: contains }, { logline: contains }] },
        include: {
          client: true,
          stages: {
            where: { status: { in: ['ACTIVE', 'BLOCKED'] } },
            include: { stageDefinition: true },
          },
        },
        take: 6,
      }),
      this.prisma.db.task.findMany({
        where: { title: contains },
        include: {
          project: { select: { id: true, title: true } },
          assignee: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      this.prisma.db.client.findMany({
        where: { OR: [{ name: contains }, { industry: contains }] },
        take: 4,
      }),
      this.prisma.db.teamMember.findMany({
        where: { OR: [{ name: contains }, { title: contains }] },
        take: 4,
      }),
      this.prisma.db.asset.findMany({
        where: { OR: [{ name: contains }, { serialTag: contains }] },
        take: 4,
      }),
      this.prisma.db.shoot.findMany({
        where: { OR: [{ title: contains }, { location: contains }] },
        include: { project: { select: { title: true } } },
        take: 4,
      }),
      this.prisma.db.lead.findMany({
        where: { OR: [{ title: contains }, { prospectName: contains }] },
        take: 4,
      }),
    ]);
    return [
      ...projects.map((p) => ({
        type: 'project' as const,
        id: p.id,
        title: `${p.code} · ${p.title}`,
        subtitle: `${p.client.name} · ${p.stages[0] ? STAGE_LABELS[p.stages[0].stageDefinition.key] : p.status.toLowerCase()}`,
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
        subtitle: `${t.project.title} · ${TASK_STATUS_LABELS[t.status]}${t.assignee ? ` · ${t.assignee.name}` : ''}`,
        projectId: t.project.id,
      })),
      ...shoots.map((s) => ({
        type: 'shoot' as const,
        id: s.id,
        title: s.title,
        subtitle: `${s.project.title} · ${s.location}`,
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
