'use client';

import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LiveStatus } from '@/lib/live-events';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { HeroArt } from './hero-art';
import { LENS_META } from './lenses';
import { TopBar } from './top-bar';
import { useUser } from './user-context';

const TZ = 'Asia/Kolkata';

export function greeting(now = new Date()) {
  const hour = Number(
    now.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }),
  );
  return hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
}

/**
 * The masthead: top bar and heading over the ink-and-sun artwork. On Home it greets the user
 * by name; every other lens gets a compact serif title so content stays above the fold.
 */
export function Masthead({ live }: { live: LiveStatus }) {
  const lens = useWorkspace((s) => s.lens);
  const home = lens === 'pulse';

  return (
    <div
      className={cn(
        'relative isolate shrink-0 overflow-hidden',
        home ? 'min-h-[300px]' : 'min-h-[176px]',
      )}
    >
      {/* Below `sm` the heading spans the full width, so the artwork is faded back behind it. */}
      <div className="absolute inset-y-0 right-0 -z-10 w-full max-sm:opacity-40 max-sm:[mask-image:linear-gradient(to_right,transparent_30%,black_80%)] lg:w-[78%]">
        <HeroArt compact={!home} />
      </div>
      {home ? (
        <p className="pointer-events-none absolute right-[31%] top-[36%] hidden font-serif text-sm italic text-text-2 min-[1700px]:block">
          Create <span className="text-brand">·</span> Produce <span className="text-brand">·</span>{' '}
          Inspire
        </p>
      ) : null}
      <TopBar live={live} />
      {home ? <Greeting /> : <LensTitle />}
    </div>
  );
}

function Greeting() {
  const user = useUser();
  const first = user.name.split(' ')[0];
  return (
    <section aria-label="Welcome" className="px-5 pb-10 pt-6 lg:px-8">
      <p
        className="font-serif text-2xl font-medium text-text sm:text-[28px]"
        suppressHydrationWarning
      >
        {greeting()},
      </p>
      <h1 className="font-serif text-5xl font-extrabold leading-[1.05] tracking-tight text-text sm:text-[64px]">
        {first}!
      </h1>
      <p className="mt-3 flex items-center gap-1.5 text-sm text-text-2">
        Let&apos;s turn ideas into impact
        <Sparkles className="size-4 text-brand-2" aria-hidden />
      </p>
      <StudioClock />
    </section>
  );
}

function LensTitle() {
  const lens = useWorkspace((s) => s.lens);
  const meta = LENS_META[lens];
  return (
    <section aria-label="Workspace header" className="px-5 pb-6 pt-4 lg:px-8">
      <h1 className="font-serif text-3xl font-bold tracking-tight text-text sm:text-4xl">
        {meta.title}
      </h1>
      <p className="mt-1 text-sm text-text-2">{meta.description}</p>
    </section>
  );
}

function StudioClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <p className="mt-1 h-4" aria-hidden />;
  return (
    <p className="mt-1 font-mono text-[11px] text-text-3" aria-label="Studio time (IST)">
      {now.toLocaleDateString('en-US', {
        timeZone: TZ,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })}{' '}
      · {now.toLocaleTimeString('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })} IST
    </p>
  );
}
