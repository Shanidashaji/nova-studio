'use client';

import { Tooltip } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { LENSES, useWorkspace } from '@/store/workspace';
import { LENS_GROUPS, LENS_META, visibleLenses } from './lenses';
import { useUser } from './user-context';

/**
 * Lens switcher, grouped (Operate · Business · Knowledge · Account) and filtered by the user's
 * permissions: an ink sidebar on large screens, an icon rail on tablets and a scrolling bottom
 * tab bar on phones. Keys 1–9 open the first nine visible lenses.
 */
export function Rail() {
  const lens = useWorkspace((s) => s.lens);
  const setLens = useWorkspace((s) => s.setLens);
  const { permissions } = useUser();
  const visible = visibleLenses(LENSES, permissions);

  return (
    <nav
      aria-label="Workspace lenses"
      className="fixed inset-x-0 bottom-0 z-30 flex h-14 border-t border-ink-line bg-ink text-ink-text md:relative md:h-auto md:w-[72px] md:flex-col md:overflow-hidden md:border-r md:border-t-0 lg:w-[208px]"
    >
      <Wordmark />
      <div className="scrollbar-none flex flex-1 overflow-x-auto md:mt-4 md:flex-col md:overflow-y-auto md:overflow-x-hidden md:px-3">
        {LENS_GROUPS.map((group) => {
          const items = visible.filter((k) => LENS_META[k].group === group.key);
          if (!items.length) return null;
          return (
            <div
              key={group.key}
              role="group"
              aria-label={group.label}
              className="flex md:mb-2 md:flex-col"
            >
              <p className="hidden px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-text-2 lg:block">
                {group.label}
              </p>
              <ul className="flex md:flex-col md:gap-0.5">
                {items.map((key) => {
                  const meta = LENS_META[key];
                  const Icon = meta.icon;
                  const active = lens === key;
                  const index = visible.indexOf(key);
                  const shortcut = index < 9 ? String(index + 1) : null;
                  const button = (
                    <button
                      type="button"
                      onClick={() => setLens(key)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative flex min-w-16 flex-1 flex-col items-center justify-center gap-0.5 px-2 text-ink-text-2 transition-colors hover:text-ink-text',
                        'md:h-9 md:min-w-0 md:flex-none md:rounded-[12px] md:hover:bg-ink-2',
                        'lg:w-full lg:flex-row lg:justify-start lg:gap-3 lg:px-3',
                        active &&
                          'text-ink-text md:bg-[var(--surface-1)] md:text-[var(--text)] md:shadow-[0_6px_18px_-8px_rgb(0_0_0/0.6)] md:hover:bg-[var(--surface-1)]',
                      )}
                    >
                      <Icon
                        className={cn('size-[17px] shrink-0', active && 'text-brand')}
                        strokeWidth={1.9}
                      />
                      {/* One label: small on phones, screen-reader-only on the icon rail, full on desktop. */}
                      <span className="whitespace-nowrap text-[10px] md:sr-only lg:not-sr-only lg:text-[13px] lg:font-medium">
                        {meta.label}
                      </span>
                      {shortcut ? (
                        <span
                          aria-hidden
                          className={cn(
                            'ml-auto hidden font-mono text-[10px] lg:inline',
                            active ? 'text-[var(--text-3)]' : 'text-ink-text-2/60',
                          )}
                        >
                          {shortcut}
                        </span>
                      ) : null}
                    </button>
                  );
                  return (
                    <li key={key} className="flex">
                      {/* Labels are visible on large screens; the icon rail relies on tooltips. */}
                      <span className="flex flex-1 lg:hidden">
                        <Tooltip
                          side="right"
                          content={
                            <span>
                              {meta.label}
                              {shortcut ? (
                                <span className="ml-1 font-mono text-text-3">{shortcut}</span>
                              ) : null}
                            </span>
                          }
                        >
                          {button}
                        </Tooltip>
                      </span>
                      <span className="hidden flex-1 lg:flex">{button}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <SidebarFooter />
    </nav>
  );
}

/** The NOVA monogram: an "N" cut from two strokes, with a vermilion fold. */
export function NovaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M8 34V6h6l12 17V6h6v28h-6L14 17v17z" fill="currentColor" />
      <path d="M14 6l12 17v-6L18 6z" fill="var(--brand)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="hidden select-none flex-col items-center px-3 pt-6 md:flex" aria-hidden>
      <NovaMark className="size-9 text-ink-text" />
      <p className="mt-1.5 hidden text-[13px] font-semibold tracking-[0.32em] text-ink-text lg:block">
        NOVA
      </p>
    </div>
  );
}

/**
 * A night-shoot vignette that anchors the sidebar: a cinematographer at the camera under a
 * vermilion key light — pure SVG, no stock imagery.
 */
export function SidebarFooter() {
  return (
    <div
      className="pointer-events-none relative mt-auto hidden h-56 shrink-0 lg:block [@media(max-height:900px)]:!hidden"
      aria-hidden
    >
      <svg
        viewBox="0 0 208 288"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-0 size-full"
      >
        <defs>
          <radialGradient id="sb-key" cx="0.5" cy="0.46" r="0.55">
            <stop offset="0" stopColor="var(--brand-2)" stopOpacity="0.85" />
            <stop offset="0.35" stopColor="var(--brand)" stopOpacity="0.45" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sb-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ink)" stopOpacity="1" />
            <stop offset="0.3" stopColor="var(--ink)" stopOpacity="0" />
          </linearGradient>
          <filter id="sb-haze">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <rect width="208" height="288" fill="url(#sb-key)" />
        {/* Smoke haze */}
        <g filter="url(#sb-haze)" opacity="0.5">
          <ellipse cx="70" cy="150" rx="60" ry="18" fill="var(--brand-2)" />
          <ellipse cx="150" cy="190" rx="50" ry="14" fill="var(--brand)" />
        </g>
        <g fill="#0b0908">
          {/* Camera on tripod */}
          <rect x="104" y="150" width="50" height="28" rx="3" />
          <rect x="152" y="155" width="20" height="18" rx="2" />
          <rect x="170" y="152" width="8" height="24" rx="1" />
          <rect x="112" y="140" width="26" height="10" rx="2" />
          <rect x="92" y="156" width="14" height="10" rx="2" />
          <path d="M127 178 l-30 96 h5 l27 -84 l27 84 h5 z" />
          <rect x="125" y="178" width="4" height="96" />
          {/* Operator, eye to the viewfinder */}
          <circle cx="84" cy="150" r="10" />
          <path d="M74 146 q10 -12 22 -2 l-2 4 q-10 -6 -20 0 z" />
          <path d="M66 166 q18 -8 30 -2 l10 -4 l2 8 l-12 8 l2 40 l-8 60 h-8 l-4 -52 l-6 52 h-8 l-2 -60 z" />
        </g>
        <path d="M0 268 Q104 252 208 268 V288 H0 Z" fill="#0b0908" />
        <rect width="208" height="288" fill="url(#sb-fade)" />
      </svg>
      <div className="absolute bottom-5 left-5 flex items-center gap-2">
        <NovaMark className="size-6 text-ink-text" />
        <p className="text-[10px] leading-3 text-ink-text">
          Neon Minds
          <br />
          <span className="text-ink-text-2">Production</span>
        </p>
      </div>
    </div>
  );
}
