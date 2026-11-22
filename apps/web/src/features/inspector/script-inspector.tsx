'use client';

import { CREATIVE_KIND_LABELS, SCRIPT_STATUS_LABELS } from '@nova/shared';
import { ScrollText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { PanelState } from '@/components/ui/panel';
import { scriptTone } from '@/features/scripts/scripts-lens';
import { date } from '@/lib/format';
import { useScript } from '@/lib/queries';
import { useWorkspace } from '@/store/workspace';
import { InspectorSection, KeyValue } from './inspector-router';

/** Quick look at a creative document; full editing lives in the Scripts lens. */
export function ScriptInspector({ id }: { id: string }) {
  const q = useScript(id);
  const setLens = useWorkspace((s) => s.setLens);
  const inspect = useWorkspace((s) => s.inspect);
  if (q.isPending)
    return (
      <div className="p-4">
        <Skeleton className="h-40" />
      </div>
    );
  return (
    <PanelState query={q}>
      {q.data ? (
        <div>
          <div className="px-4 pb-3 pt-4">
            <button
              type="button"
              className="font-mono text-[10px] text-text-3 hover:text-text"
              onClick={() => inspect({ type: 'project', id: q.data.project.id })}
            >
              {q.data.project.code} · {q.data.project.title}
            </button>
            <h2 className="text-lg font-semibold">{q.data.title}</h2>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone={scriptTone[q.data.status]}>{SCRIPT_STATUS_LABELS[q.data.status]}</Badge>
              <span className="text-xs text-text-3">
                {CREATIVE_KIND_LABELS[q.data.kind]} · v{q.data.currentVersion}
              </span>
            </div>
            <Button size="sm" className="mt-2" onClick={() => setLens('scripts')}>
              <ScrollText /> Open in Scripts
            </Button>
          </div>
          <InspectorSection title="Details">
            <KeyValue
              items={[
                ['Scenes', String(q.data.scenes.length)],
                ['Versions', String(q.data.versions.length)],
                [
                  'Decided',
                  q.data.decidedBy
                    ? `${q.data.decidedBy}${q.data.decidedAt ? `, ${date(q.data.decidedAt)}` : ''}`
                    : '—',
                ],
              ]}
            />
            {q.data.decisionNote ? (
              <p className="mt-2 text-xs text-text-2">“{q.data.decisionNote}”</p>
            ) : null}
          </InspectorSection>
          <InspectorSection title="Text">
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs">
              {q.data.body}
            </pre>
          </InspectorSection>
        </div>
      ) : null}
    </PanelState>
  );
}
