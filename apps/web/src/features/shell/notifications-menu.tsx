'use client';

import { Popover as P } from 'radix-ui';
import { Bell, CheckCheck, CircleDot, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ago } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useInbox } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useWorkspace, type InspectType, type Lens } from '@/store/workspace';
import { visibleLenses } from './lenses';
import { useUser } from './user-context';

const INSPECTABLE = new Set<InspectType>([
  'project',
  'task',
  'member',
  'client',
  'shoot',
  'asset',
  'lead',
  'talent',
  'script',
]);

/** Records without an inspector open the lens where they are worked on. */
const LENS_FOR: Record<string, Lens> = {
  approval_request: 'approvals',
  expense: 'finance',
  invoice: 'finance',
  vendor: 'finance',
  finance: 'finance',
  purchase_request: 'procurement',
  purchase_order: 'procurement',
  stock: 'inventory',
  leave: 'people',
  attendance: 'people',
  employee: 'people',
  document: 'documents',
  studio_booking: 'schedule',
  user: 'settings',
  role: 'settings',
  message: 'comms',
  template: 'comms',
  scene: 'scripts',
  budget: 'productions',
};

export function NotificationsMenu() {
  const [filter, setFilter] = useState<'all' | 'unread' | 'open' | 'resolved'>('open');
  const q = useInbox(filter);
  const mark = useApiMutation<{ id: string; change: 'unread' | 'resolve' | 'reopen' }>(
    'POST',
    ({ id, change }) => `/notifications/${id}/${change}`,
    {
      success: (_r, b) =>
        b.change === 'resolve'
          ? 'Marked resolved'
          : b.change === 'reopen'
            ? 'Reopened'
            : 'Marked unread',
    },
  );
  const inspect = useWorkspace((s) => s.inspect);
  const setLens = useWorkspace((s) => s.setLens);
  const { permissions } = useUser();
  const markRead = useApiMutation<{ id: string }>('POST', ({ id }) => `/notifications/${id}/read`);
  const markAll = useApiMutation<void>('POST', '/notifications/read-all', {
    success: 'All notifications marked as read',
  });
  const unread = q.data?.unread ?? 0;

  return (
    <P.Root>
      <P.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          className="relative"
        >
          <Bell />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-critical px-1 font-mono text-[9px] leading-4 text-white">
              {unread}
            </span>
          ) : null}
        </Button>
      </P.Trigger>
      <P.Portal>
        <P.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(380px,calc(100vw-32px))] rounded-[var(--radius-md)] border border-line bg-surface-2 shadow-[var(--shadow-float)]"
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            <Button
              variant="ghost"
              size="sm"
              disabled={!unread}
              loading={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </Button>
          </div>
          <div
            role="radiogroup"
            aria-label="Show"
            className="flex gap-1 border-b border-line px-2 py-1.5"
          >
            {(['open', 'unread', 'resolved', 'all'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  'h-6 rounded px-2 text-xs capitalize pointer-coarse:h-8',
                  filter === f ? 'bg-surface-3 text-text' : 'text-text-3 hover:text-text',
                )}
              >
                {f}
                {f === 'open' && q.data ? ` (${q.data.open})` : ''}
              </button>
            ))}
          </div>
          <ul className="max-h-96 overflow-y-auto p-1">
            {q.data?.items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-text-3">Nothing new.</li>
            ) : null}
            {q.isError ? (
              <li className="px-3 py-6 text-center text-sm text-critical">
                Notifications could not load.
              </li>
            ) : null}
            {q.data?.items.map((n) => (
              <li key={n.id}>
                <P.Close asChild>
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.readAt) markRead.mutate({ id: n.id });
                      if (
                        n.entityType &&
                        n.entityId &&
                        INSPECTABLE.has(n.entityType as InspectType)
                      ) {
                        inspect({ type: n.entityType as InspectType, id: n.entityId });
                        return;
                      }
                      const lens = n.entityType ? LENS_FOR[n.entityType] : undefined;
                      if (lens && visibleLenses([lens], permissions).length > 0) setLens(lens);
                    }}
                    className="flex w-full gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left hover:bg-surface-3"
                  >
                    <span
                      className={cn(
                        'mt-1.5 size-1.5 shrink-0 rounded-full',
                        n.readAt ? 'bg-transparent' : 'bg-signal',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-sm',
                          n.readAt ? 'text-text-2' : 'font-medium text-text',
                        )}
                      >
                        {n.title}
                      </span>
                      {n.body ? (
                        <span className="block truncate text-xs text-text-3">{n.body}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-2xs text-text-3">
                      {ago(n.createdAt)}
                    </span>
                  </button>
                </P.Close>
                <div className="-mt-1 flex justify-end gap-1 px-2 pb-1">
                  {n.readAt ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-2xs"
                      onClick={() => mark.mutate({ id: n.id, change: 'unread' })}
                    >
                      <CircleDot /> Unread
                    </Button>
                  ) : null}
                  {n.resolvedAt ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-2xs"
                      onClick={() => mark.mutate({ id: n.id, change: 'reopen' })}
                    >
                      <Undo2 /> Reopen
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-2xs"
                      onClick={() => mark.mutate({ id: n.id, change: 'resolve' })}
                    >
                      <CheckCheck /> Resolve
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
