import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm">
        <p className="eyebrow">Scene missing · 404</p>
        <h1 className="mt-2 font-display text-4xl italic">This shot isn’t in the edit.</h1>
        <p className="mt-2 text-sm text-text-2">The page you asked for does not exist in NOVA.</p>
        <Link
          href="/studio"
          className="mt-4 inline-block text-sm text-signal underline-offset-4 hover:underline"
        >
          Back to the studio
        </Link>
      </div>
    </main>
  );
}
