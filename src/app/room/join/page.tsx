import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { JoinRoomForm } from '@/components/JoinRoomForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Joining by code, on its own page.
 *
 * Mostly reached by being turned away from a room you are not in, so it is
 * built on the same kit as every other page — the slim bar, then one panel —
 * rather than the old full header it was left on.
 */
export default function JoinRoomPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-3 pb-10 pt-4 text-slate-100 sm:px-6 sm:pb-12 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-5">
        <AppHeader variant="slim" />

        <div className="mx-auto mt-4 w-full max-w-lg rounded-2xl border border-amber-300/30 bg-slate-900/80 p-6 sm:mt-8 sm:p-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-amber-400">Tables</p>
          <h1 className="mt-1.5 text-3xl font-semibold text-white">Join a table</h1>
          <p className="mt-2 text-sm text-slate-400">
            Enter the 4-character code the host sent you.
          </p>

          <JoinRoomForm />

          <p className="mt-6 text-center text-sm">
            <Link
              href="/dashboard"
              className="font-medium text-slate-400 transition hover:text-amber-300"
            >
              ← Back to the dashboard
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
