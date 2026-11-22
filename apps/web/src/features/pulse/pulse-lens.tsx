'use client';

import { ActiveProjects } from './active-projects';
import { AttentionQueue } from './attention-queue';
import { BusinessGlance } from './business-glance';
import { CommandCenter } from './command-center';
import { TeamCapacity } from './team-capacity';
import { UpcomingShoots } from './upcoming-shoots';

/**
 * Situation awareness first (Endsley): what is happening, what it means, what happens next.
 * Row one is the work and the decisions it needs; row two is people, money and the next shoot.
 * NOVA itself floats bottom-right as the companion, so it is not repeated here.
 */
export function PulseLens() {
  return (
    <div className="flex flex-col gap-4 2xl:pr-24">
      <CommandCenter />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ActiveProjects />
        {/* On wide screens the queue takes the projects' height and scrolls inside it. */}
        <div className="relative min-h-0">
          <AttentionQueue className="xl:absolute xl:inset-0" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.1fr)]">
        <TeamCapacity />
        <BusinessGlance />
        <UpcomingShoots className="md:col-span-2 xl:col-span-1" />
      </div>
    </div>
  );
}
