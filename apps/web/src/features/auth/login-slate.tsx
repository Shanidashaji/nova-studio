'use client';

import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { HeroArt } from '@/features/shell/hero-art';

const TZ = 'Asia/Kolkata';

/**
 * The artwork half of the sign-in screen, built from the workspace masthead: the same serif
 * heading, ink-and-sun artwork and studio clock, so signing in feels like the dashboard's front
 * door rather than a separate site.
 */
export function LoginSlate() {
  return (
    <section className="relative isolate hidden min-h-dvh overflow-hidden lg:block" aria-hidden>
      {/* The strokes run off the right edge; fade them out before the form column. */}
      <div className="absolute bottom-0 right-0 -z-10 aspect-[900/340] w-[120%] [mask-image:linear-gradient(to_left,transparent,black_14%)]">
        <HeroArt />
      </div>
      <div className="px-12 pt-16 xl:px-16">
        <p className="font-serif text-2xl font-medium text-text">Welcome back to the studio,</p>
        <h2 className="mt-1 font-serif text-6xl font-extrabold leading-[1.04] tracking-tight text-text xl:text-7xl">
          Every production,
          <br />
          <em className="text-brand">one pulse.</em>
        </h2>
        <p className="mt-4 flex max-w-md items-center gap-1.5 text-sm text-text-2">
          From brief to delivery — shoots, crew, equipment, approvals and the business behind them,
          in one connected workspace.
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-text-2">
          Let&apos;s turn ideas into impact
          <Sparkles className="size-4 text-brand-2" />
        </p>
        <StudioClock />
        <p className="mt-8 font-serif text-sm italic text-text-2">
          Create <span className="text-brand">·</span> Produce <span className="text-brand">·</span>{' '}
          Inspire
        </p>
      </div>
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
  if (!now) return <p className="mt-1 h-4" />;
  return (
    <p className="mt-1 font-mono text-[11px] text-text-3">
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
