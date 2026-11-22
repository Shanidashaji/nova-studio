'use client';

import type { ProjectSummary } from '@nova/shared';
import { useMemo } from 'react';
import { useProjects } from '@/lib/queries';
import { useWorkspace } from '@/store/workspace';

/**
 * The workspace focus as a project predicate. Every lens uses this to narrow what it shows,
 * which is what makes stage, client, project and person selections cross-filter the workspace.
 */
export function useFocusFilter() {
  const focus = useWorkspace((s) => s.focus);
  const projects = useProjects({ status: 'ALL' });

  return useMemo(() => {
    const byId = new Map((projects.data ?? []).map((p) => [p.id, p]));
    const matches = (p: ProjectSummary | undefined): boolean => {
      if (!focus) return true;
      if (!p) return false;
      switch (focus.type) {
        case 'stage':
          return p.stage?.key === focus.id;
        case 'client':
          return p.client.id === focus.id;
        case 'project':
          return p.id === focus.id;
        case 'member':
          return p.team.some((m) => m.id === focus.id);
      }
    };
    return {
      focus,
      active: focus !== null,
      matches,
      /** For items that only carry a project id (attention, activity, shoots). */
      matchesProjectId: (id: string | null | undefined) =>
        !focus ? true : id ? matches(byId.get(id)) : false,
      projectsById: byId,
    };
  }, [focus, projects.data]);
}
