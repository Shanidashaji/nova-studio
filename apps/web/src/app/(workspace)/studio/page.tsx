import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Workspace } from '@/features/shell/workspace';
import { getSessionUser } from '@/lib/server-session';

export const metadata: Metadata = { title: 'Studio' };
export const dynamic = 'force-dynamic';

/** The single NOVA workspace. Everything else opens inside it. */
export default async function StudioPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/studio');
  return <Workspace user={user} />;
}
