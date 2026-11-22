import type { Permission } from '@nova/shared';
import {
  BadgeCheck,
  BrainCircuit,
  Boxes,
  Clapperboard,
  FileStack,
  Handshake,
  History,
  House,
  IndianRupee,
  PackageSearch,
  Settings2,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Lens } from '@/store/workspace';

export const LENS_META: Record<
  Lens,
  {
    /** Navigation label. */
    label: string;
    /** Heading shown in the workspace hero. */
    title: string;
    icon: LucideIcon;
    description: string;
    /** Sidebar group. */
    group: LensGroup;
    /** The lens is shown when the user holds any of these (the API enforces the same rules). */
    anyOf?: Permission[];
  }
> = {
  pulse: {
    label: 'Home',
    title: 'Studio Pulse',
    icon: House,
    description: 'Your creative operations at a glance',
    group: 'operate',
  },
  productions: {
    label: 'Projects',
    title: 'Projects',
    icon: Clapperboard,
    description: 'Every production in the pipeline',
    group: 'operate',
  },
  schedule: {
    label: 'Resources',
    title: 'Schedule & Resources',
    icon: Boxes,
    description: 'Shoots, crew and equipment',
    group: 'operate',
  },
  people: {
    label: 'Creative Team',
    title: 'Creative Team',
    icon: Users,
    description: 'Team workload and assignments',
    group: 'operate',
  },
  clients: {
    label: 'Clients',
    title: 'Clients & Sales',
    icon: Handshake,
    description: 'Relationships and pipeline',
    group: 'operate',
  },
  business: {
    label: 'Intelligence',
    title: 'Business Intelligence',
    icon: BrainCircuit,
    description: 'Budgets, revenue and trends (demo data)',
    group: 'knowledge',
    anyOf: ['finance:read'],
  },
  activity: {
    label: 'Activity',
    title: 'Activity & Audit',
    icon: History,
    description: 'Audit trail of every change',
    group: 'knowledge',
  },
  finance: {
    label: 'Finance',
    title: 'Finance',
    icon: IndianRupee,
    description: 'Invoices, payments, expenses and vendors (demo data)',
    group: 'business',
    anyOf: ['finance:read', 'expense:submit'],
  },
  procurement: {
    label: 'Procurement',
    title: 'Procurement',
    icon: ShoppingCart,
    description: 'Purchase requests, quotations and orders',
    group: 'business',
    anyOf: ['procurement:request', 'procurement:approve', 'procurement:order', 'finance:read'],
  },
  inventory: {
    label: 'Inventory',
    title: 'Inventory & Equipment',
    icon: PackageSearch,
    description: 'Consumable stock, equipment condition and maintenance',
    group: 'business',
  },
  approvals: {
    label: 'Approvals',
    title: 'Approvals',
    icon: BadgeCheck,
    description: 'Everything waiting on a decision, and its history',
    group: 'business',
  },
  documents: {
    label: 'Documents',
    title: 'Documents',
    icon: FileStack,
    description: 'Briefs, scripts, contracts and records — versioned and access-controlled',
    group: 'knowledge',
    anyOf: ['document:read'],
  },
  settings: {
    label: 'Settings',
    title: 'Settings',
    icon: Settings2,
    description: 'Users, roles, approval rules and your account',
    group: 'settings',
  },
};

export type LensGroup = 'operate' | 'business' | 'knowledge' | 'settings';
export const LENS_GROUPS: { key: LensGroup; label: string }[] = [
  { key: 'operate', label: 'Operate' },
  { key: 'business', label: 'Business' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'settings', label: 'Account' },
];

/** Lenses the user may open, in sidebar order. */
export function visibleLenses(lenses: readonly Lens[], permissions: readonly Permission[]) {
  return lenses.filter((l) => {
    const anyOf = LENS_META[l].anyOf;
    return !anyOf || anyOf.some((p) => permissions.includes(p));
  });
}
