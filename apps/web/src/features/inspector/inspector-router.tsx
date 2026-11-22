'use client';

import type { InspectRef } from '@/store/workspace';
import { AssetInspector } from './asset-inspector';
import { ClientInspector } from './client-inspector';
import { LeadInspector } from './lead-inspector';
import { MemberInspector } from './member-inspector';
import { ProjectInspector } from './project/project-inspector';
import { ScriptInspector } from './script-inspector';
import { ShootInspector } from './shoot-inspector';
import { TalentInspector } from './talent-inspector';
import { TaskInspector } from './task-inspector';
import { WorkflowsInspector } from './workflows-inspector';

/** Any entity, from anywhere, opens here. */
export function InspectorRouter({ target }: { target: InspectRef }) {
  switch (target.type) {
    case 'project':
      return <ProjectInspector id={target.id} section={target.section} />;
    case 'task':
      return <TaskInspector id={target.id} />;
    case 'member':
      return <MemberInspector id={target.id} />;
    case 'client':
      return <ClientInspector id={target.id} />;
    case 'shoot':
      return <ShootInspector id={target.id} />;
    case 'asset':
      return <AssetInspector id={target.id} />;
    case 'lead':
      return <LeadInspector id={target.id} />;
    case 'workflows':
      return <WorkflowsInspector />;
    case 'talent':
      return <TalentInspector id={target.id} />;
    case 'script':
      return <ScriptInspector id={target.id} />;
  }
}

/** Shared inspector chrome. */
export function InspectorSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line px-4 py-3.5 last:border-b-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="eyebrow">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function KeyValue({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-text-3">{k}</dt>
          <dd className="min-w-0 truncate text-text">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
