'use client';

import { DropdownMenu as M } from 'radix-ui';
import { ChevronDown, LogOut, Moon, Search, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, Kbd, Tooltip } from '@/components/ui/misc';
import { useSignOut } from '@/features/auth/sign-out';
import type { LiveStatus } from '@/lib/live-events';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { NovaRobot } from '@/features/assistant/robot/nova-robot';
import { NotificationsMenu } from './notifications-menu';
import { useCan, useUser } from './user-context';

export function TopBar({ live }: { live: LiveStatus }) {
  const setPaletteOpen = useWorkspace((s) => s.setPaletteOpen);
  const showNova = useWorkspace((s) => s.showNova);
  const canAsk = useCan('assistant:use');

  return (
    <header className="relative z-10 flex h-16 shrink-0 items-center gap-2 px-4 pt-2 sm:gap-3 lg:px-8">
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-line bg-surface-1/90 px-4 text-left text-sm text-text-3 shadow-[var(--shadow-card)] backdrop-blur transition-colors hover:border-line-strong hover:text-text-2 lg:max-w-[560px]"
      >
        <Search className="size-4 shrink-0 text-text-2" />
        <span className="truncate">
          Search<span className="hidden min-[400px]:inline"> anything</span>…{' '}
          <span className="hidden sm:inline">
            {canAsk ? '(projects, clients, tasks, or ask NOVA…)' : '(projects, clients, tasks…)'}
          </span>
        </span>
        <span className="ml-auto hidden items-center gap-1 sm:flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1 rounded-full border border-line bg-surface-1/85 py-1 pl-1.5 pr-1 shadow-[var(--shadow-card)] backdrop-blur">
        <LiveIndicator status={live} />
        <ThemeToggle />
        {canAsk ? (
          <Tooltip content="NOVA assistant (Ctrl J)">
            <Button
              variant="ghost"
              size="icon"
              onClick={showNova}
              className="rounded-full text-brand"
              aria-label="Open NOVA assistant"
            >
              <NovaRobot state="idle" still size={20} className="!size-5" />
            </Button>
          </Tooltip>
        ) : null}
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  );
}

function LiveIndicator({ status }: { status: LiveStatus }) {
  const label = { live: 'Live', connecting: 'Connecting', offline: 'Offline' }[status];
  return (
    <Tooltip
      content={
        status === 'live'
          ? 'Receiving changes in real time'
          : 'Real-time updates unavailable; data refreshes on actions'
      }
    >
      <span
        className="mr-1 hidden items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-2xs text-text-3 sm:inline-flex"
        role="status"
      >
        <span
          className={cn(
            'size-1.5 rounded-full',
            status === 'live'
              ? 'live-dot bg-signal'
              : status === 'connecting'
                ? 'bg-attention'
                : 'bg-critical',
          )}
        />
        {label}
      </span>
    </Tooltip>
  );
}

function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'),
    () => 'light' as const,
  );
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('nova-theme-v2', next);
    } catch {
      /* storage unavailable: theme applies for this visit only */
    }
  };
  return (
    <Tooltip content={theme === 'dark' ? 'Daylight review theme' : 'Grading-suite theme'}>
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle colour theme">
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>
    </Tooltip>
  );
}

function subscribeTheme(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

function UserMenu() {
  const user = useUser();
  const { signOut, pending } = useSignOut();
  return (
    <M.Root>
      <M.Trigger asChild>
        <button
          type="button"
          className="ml-1 flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-surface-3"
        >
          <span aria-hidden className="rounded-full ring-2 ring-brand-line">
            <Avatar name={user.name} size={32} />
          </span>
          <span className="sr-only md:hidden">Account menu: {user.name}</span>
          <span className="sr-only hidden md:inline">Account menu:</span>
          <span className="hidden text-left leading-4 md:block">
            <span className="block text-xs font-medium text-text">{user.name}</span>
            <span className="flex items-center gap-0.5 text-[10px] text-text-3">
              {user.role.name} <ChevronDown className="size-3" />
            </span>
          </span>
        </button>
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-56 rounded-[var(--radius-md)] border border-line bg-surface-2 p-1 shadow-[var(--shadow-float)]"
        >
          <div className="px-2.5 py-2">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-text-3">{user.email}</p>
            <p className="mt-1 font-mono text-2xs text-text-3">
              {user.permissions.length} permissions · {user.role.key}
            </p>
          </div>
          <M.Separator className="my-1 h-px bg-line" />
          <M.Item
            onSelect={() => void signOut()}
            disabled={pending}
            className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-text-2 outline-none data-[highlighted]:bg-surface-3 data-[highlighted]:text-text"
          >
            <LogOut className="size-3.5" /> Sign out
          </M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
