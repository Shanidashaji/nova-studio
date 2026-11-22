'use client';

import { ASSET_STATUSES, STUDIO_LOCATION_LABELS } from '@nova/shared';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/misc';
import { PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { dateTime, money, titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useAssets } from '@/lib/queries';
import { useWorkspace } from '@/store/workspace';
import { InspectorSection, KeyValue } from './inspector-router';

export function AssetInspector({ id }: { id: string }) {
  const q = useAssets();
  const canWrite = useCan('asset:write');
  const inspect = useWorkspace((s) => s.inspect);
  const update = useApiMutation<{ status: string }>('PATCH', `/assets/${id}`, {
    success: 'Equipment status updated',
  });
  const a = q.data?.find((x) => x.id === id);
  if (q.isPending)
    return (
      <div className="p-4">
        <Skeleton className="h-40" />
      </div>
    );

  return (
    <PanelState query={q} isEmpty={!a} empty={{ title: 'Equipment not found.' }}>
      {a ? (
        <div>
          <div className="px-4 pb-3 pt-4">
            <p className="font-mono text-[10px] text-text-3">{a.serialTag}</p>
            <h2 className="text-lg font-semibold">{a.name}</h2>
            <div className="mt-2 flex items-center gap-2">
              <Badge
                tone={
                  a.status === 'AVAILABLE'
                    ? 'signal'
                    : a.status === 'MAINTENANCE'
                      ? 'attention'
                      : 'neutral'
                }
              >
                {titleCase(a.status)}
              </Badge>
              {canWrite ? (
                <Select
                  aria-label="Equipment status"
                  value={a.status}
                  onChange={(e) => update.mutate({ status: e.target.value })}
                  className="h-7 w-36 text-xs"
                >
                  {ASSET_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
            {a.notes ? <p className="mt-2 text-xs text-text-3">{a.notes}</p> : null}
          </div>
          <InspectorSection title="Details">
            <KeyValue
              items={[
                ['Category', titleCase(a.category)],
                ['Home studio', STUDIO_LOCATION_LABELS[a.homeLocation]],
                ['Day rate', money(a.dailyRate, { exact: true })],
              ]}
            />
          </InspectorSection>
          <InspectorSection title="Bookings (next three weeks)">
            {a.bookings.length === 0 ? (
              <p className="text-sm text-text-3">Free in this window.</p>
            ) : null}
            <ul className="flex flex-col gap-1.5">
              {a.bookings.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() =>
                      b.shoot
                        ? inspect({ type: 'shoot', id: b.shoot.id })
                        : b.project && inspect({ type: 'project', id: b.project.id })
                    }
                    className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1 text-left text-sm hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {b.shoot?.title ?? b.project?.title ?? 'Booking'}
                      </span>
                      <span className="block font-mono text-[10px] text-text-3">
                        {dateTime(b.startsAt)} → {dateTime(b.endsAt)}
                      </span>
                    </span>
                    {b.conflict ? <Badge tone="critical">Conflict</Badge> : null}
                  </button>
                </li>
              ))}
            </ul>
          </InspectorSection>
        </div>
      ) : null}
    </PanelState>
  );
}
