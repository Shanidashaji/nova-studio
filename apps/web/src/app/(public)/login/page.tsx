import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/features/auth/login-form';
import { LoginSlate } from '@/features/auth/login-slate';
import { SignedOutNotice } from '@/features/auth/signed-out-notice';
import { NovaMark, SidebarFooter, Wordmark } from '@/features/shell/rail';
import { getSessionUser } from '@/lib/server-session';

export const metadata: Metadata = { title: 'Sign in' };

/** Only same-site relative paths are accepted as a post-login destination. */
function safeNext(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/studio';
}

/**
 * Sign-in, laid out like the workspace it opens: the ink sidebar, the serif masthead over the
 * ink-and-sun artwork, and the form in a workspace card.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getSessionUser()) redirect(next);

  return (
    <main className="flex min-h-dvh bg-bg">
      <aside
        className="hidden w-[208px] shrink-0 flex-col bg-ink text-ink-text lg:flex"
        aria-hidden
      >
        <Wordmark />
        <p className="mt-2 text-center font-mono text-[10px] tracking-[0.2em] text-ink-text-2">
          STUDIO OS
        </p>
        <SidebarFooter />
      </aside>

      <div className="grid min-w-0 flex-1 grid-cols-1 lg:grid-cols-[1.25fr_1fr]">
        <LoginSlate />

        <section className="flex items-center justify-center px-4 py-12 sm:px-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex items-center gap-2.5 lg:hidden" aria-hidden>
              <span className="grid size-10 place-items-center rounded-[12px] bg-ink">
                <NovaMark className="size-6 text-ink-text" />
              </span>
              <span className="text-[13px] font-semibold tracking-[0.32em] text-text">NOVA</span>
            </div>

            <div className="rounded-[var(--radius-xl)] border border-line bg-surface-1 p-6 shadow-[var(--shadow-card)] sm:p-8">
              <p className="eyebrow">Studio access</p>
              <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-text">
                Sign in to NOVA
              </h1>
              <p className="mt-1 text-sm text-text-2">
                Administrators and producers of the studio workspace.
              </p>
              {params.expired ? (
                <p
                  role="status"
                  className="mt-4 rounded-[var(--radius-sm)] border border-attention-line bg-attention-soft px-3 py-2 text-xs text-attention"
                >
                  Your session ended. Sign in again to continue.
                </p>
              ) : null}
              <LoginForm next={next} />
            </div>
          </div>
        </section>
      </div>

      {params.signed_out === '1' ? <SignedOutNotice /> : null}
    </main>
  );
}
