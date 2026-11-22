'use client';

import { AnimatePresence, motion } from 'motion/react';
import { ActivityLens } from '@/features/activity/activity-lens';
import { ApprovalsLens } from '@/features/approvals/approvals-lens';
import { DocumentsLens } from '@/features/documents/documents-lens';
import { FinanceLens } from '@/features/finance/finance-lens';
import { InventoryLens } from '@/features/inventory/inventory-lens';
import { ProcurementLens } from '@/features/procurement/procurement-lens';
import { SettingsLens } from '@/features/settings/settings-lens';
import { BusinessLens } from '@/features/business/business-lens';
import { ClientsLens } from '@/features/clients/clients-lens';
import { PeopleLens } from '@/features/people/people-lens';
import { ProductionsLens } from '@/features/productions/productions-lens';
import { PulseLens } from '@/features/pulse/pulse-lens';
import { ScheduleLens } from '@/features/schedule/schedule-lens';
import { CommsLens } from '@/features/comms/comms-lens';
import { PostLens } from '@/features/post/post-lens';
import { ReportsLens } from '@/features/reports/reports-lens';
import { ScriptsLens } from '@/features/scripts/scripts-lens';
import { ShootDayLens } from '@/features/shootday/shoot-day-lens';
import { TalentLens } from '@/features/talent/talent-lens';
import { TasksLens } from '@/features/tasks/tasks-lens';
import { useWorkspace, type Lens } from '@/store/workspace';

const LENS_COMPONENTS: Record<Lens, () => React.JSX.Element> = {
  pulse: PulseLens,
  productions: ProductionsLens,
  schedule: ScheduleLens,
  people: PeopleLens,
  clients: ClientsLens,
  business: BusinessLens,
  activity: ActivityLens,
  finance: FinanceLens,
  procurement: ProcurementLens,
  inventory: InventoryLens,
  approvals: ApprovalsLens,
  documents: DocumentsLens,
  settings: SettingsLens,
  tasks: TasksLens,
  comms: CommsLens,
  shootday: ShootDayLens,
  scripts: ScriptsLens,
  talent: TalentLens,
  post: PostLens,
  reports: ReportsLens,
};

/** Renders the active lens. Lenses are arrangements of the same data, not separate pages. */
export function LensCanvas() {
  const lens = useWorkspace((s) => s.lens);
  const Component = LENS_COMPONENTS[lens];
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={lens}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        className="flex-1 px-4 pb-28 pt-3 lg:px-8 xl:pb-6"
      >
        <Component />
      </motion.div>
    </AnimatePresence>
  );
}
