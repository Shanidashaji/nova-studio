'use client';

import { Command } from 'cmdk';
import { Dialog as D } from 'radix-ui';
import {
  Building2,
  Camera,
  Clapperboard,
  CornerDownLeft,
  Crosshair,
  Handshake,
  ListChecks,
  LogOut,
  Settings2,
  Package,
  Sparkles,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { STAGE_KEYS, STAGE_LABELS, type SearchResult } from '@nova/shared';
import { Kbd } from '@/components/ui/misc';
import { LENS_META, visibleLenses } from '@/features/shell/lenses';
import { useCan, useUser } from '@/features/shell/user-context';
import { useSearch } from '@/lib/queries';
import { LENSES, useWorkspace, type InspectType } from '@/store/workspace';
import { useNovaComposer } from '@/features/assistant/composer-store';
import { useSignOut } from '@/features/auth/sign-out';

const RESULT_ICON: Record<SearchResult['type'], LucideIcon> = {
  project: Clapperboard,
  task: ListChecks,
  client: Building2,
  member: User,
  asset: Package,
  shoot: Camera,
  lead: Handshake,
};

const ASK_EXAMPLES = [
  'What needs my attention today?',
  'Which projects are delayed?',
  'Which workflows are blocked?',
  'Show the workload of the team',
  'Summarize the activity from this week',
];

/**
 * Ctrl/⌘K: jump to any entity, switch lens, focus a stage, run an action, or ask NOVA.
 * Search is server-side across projects, tasks, clients, people, equipment, shoots and leads.
 */
export function CommandPalette() {
  const open = useWorkspace((s) => s.paletteOpen);
  const setOpen = useWorkspace((s) => s.setPaletteOpen);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)]" />
        <D.Content className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface-1 shadow-[var(--shadow-float)]">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search NOVA or run a command</D.Description>
          {/* Mounted only while open, so the query resets every time the palette closes. */}
          <PaletteBody close={() => setOpen(false)} />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function PaletteBody({ close }: { close: () => void }) {
  const setLens = useWorkspace((s) => s.setLens);
  const inspect = useWorkspace((s) => s.inspect);
  const focusStage = useWorkspace((s) => s.focusStage);
  const showNova = useWorkspace((s) => s.showNova);
  const ask = useNovaComposer((s) => s.ask);
  const { signOut } = useSignOut();
  const { permissions } = useUser();
  const canAsk = useCan('assistant:use');
  // The same list, in the same order, as the sidebar: hotkeys 1–9 follow it.
  const lenses = visibleLenses(LENSES, permissions);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const results = useSearch(debounced);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 160);
    return () => clearTimeout(t);
  }, [q]);

  const run = (fn: () => void) => {
    close();
    fn();
  };
  const askNova = (text: string) =>
    run(() => {
      showNova();
      ask(text);
    });

  return (
    <Command shouldFilter={false} label="Command palette" className="flex flex-col">
      <Command.Input
        value={q}
        onValueChange={setQ}
        placeholder="Search, jump to a lens, or ask NOVA…"
        className="h-12 border-b border-line bg-transparent px-4 text-base text-text outline-none placeholder:text-text-3"
      />
      <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-6 text-center text-sm text-text-3">
          {results.isFetching
            ? 'Searching…'
            : results.isError
              ? 'Search is unavailable right now. Try again in a moment.'
              : 'No matches.'}
        </Command.Empty>

        {q.trim() && results.isError ? (
          <p role="alert" className="px-3 py-2 text-sm text-critical">
            Search is unavailable right now. Try again in a moment.
          </p>
        ) : null}

        {q.trim() && canAsk ? (
          <Group heading="Ask NOVA">
            <Item icon={Sparkles} onSelect={() => askNova(q.trim())} tone="ai">
              Ask NOVA: “{q.trim()}”
            </Item>
          </Group>
        ) : null}

        {results.data && results.data.length > 0 && q.trim() ? (
          <Group heading="Results">
            {results.data.map((r) => (
              <Item
                key={`${r.type}:${r.id}`}
                icon={RESULT_ICON[r.type]}
                hint={r.subtitle}
                onSelect={() => run(() => inspect({ type: r.type as InspectType, id: r.id }))}
              >
                {r.title}
              </Item>
            ))}
          </Group>
        ) : null}

        {!q.trim() ? (
          <>
            <Group heading="Lenses">
              {lenses.map((l, i) => (
                <Item
                  key={l}
                  icon={LENS_META[l].icon}
                  hint={LENS_META[l].description}
                  kbd={i < 9 ? String(i + 1) : undefined}
                  onSelect={() => run(() => setLens(l))}
                >
                  {LENS_META[l].label}
                </Item>
              ))}
            </Group>
            <Group heading="Focus a stage">
              {STAGE_KEYS.map((k) => (
                <Item
                  key={k}
                  icon={Crosshair}
                  onSelect={() => run(() => focusStage(k, STAGE_LABELS[k]))}
                >
                  Focus on {STAGE_LABELS[k]}
                </Item>
              ))}
            </Group>
            {canAsk ? (
              <Group heading="Ask NOVA">
                {ASK_EXAMPLES.map((e) => (
                  <Item key={e} icon={Sparkles} tone="ai" onSelect={() => askNova(e)}>
                    {e}
                  </Item>
                ))}
              </Group>
            ) : null}
            <Group heading="Workspace">
              <Item
                icon={Settings2}
                onSelect={() => run(() => inspect({ type: 'workflows', id: 'all' }))}
              >
                Configure workflow templates
              </Item>
            </Group>
            <Group heading="Account">
              <Item icon={LogOut} onSelect={() => run(() => void signOut())}>
                Sign out
              </Item>
            </Group>
          </>
        ) : null}
      </Command.List>
      <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-2xs text-text-3">
        <span className="inline-flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>
            <CornerDownLeft className="size-3" />
          </Kbd>{' '}
          open
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Esc</Kbd> close
        </span>
        {canAsk ? (
          <span className="ml-auto inline-flex items-center gap-1">
            <Kbd>Ctrl</Kbd>
            <Kbd>J</Kbd> NOVA
          </span>
        ) : null}
      </div>
    </Command>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="mb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-text-3"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  icon: Icon,
  hint,
  kbd,
  tone,
  onSelect,
  children,
}: {
  icon: LucideIcon;
  hint?: string;
  kbd?: string;
  tone?: 'ai';
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm text-text-2 data-[selected=true]:bg-surface-3 data-[selected=true]:text-text"
    >
      <Icon className={tone === 'ai' ? 'size-4 shrink-0 text-ai' : 'size-4 shrink-0 text-text-3'} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? (
        <span className="hidden max-w-[45%] truncate text-xs text-text-3 sm:block">{hint}</span>
      ) : null}
      {kbd ? <Kbd>{kbd}</Kbd> : null}
    </Command.Item>
  );
}
