import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { LogoMark, Wordmark } from '@/components/Logo';
import { authOptions } from '@/lib/auth';
import { GAMES } from '@/lib/games';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * The front door.
 *
 * One button, not two. "Sign in" and "Open dashboard" were the same journey
 * offered twice — /dashboard already sends anyone without a session to the
 * login page, so a single way in is right for both, and whether you are signed
 * in only changes the words on it.
 *
 * The games come from the registry rather than being written out here, so a
 * game shipping is one entry changed and not a page somebody has to remember.
 */
export default async function HomePage() {
  const session = await getServerSession(authOptions);
  const signedIn = Boolean(session?.user?.email);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-12 text-center">
      <div className="w-full max-w-xl">
        <LogoMark className="mx-auto h-40 w-auto sm:h-52" />

        <Wordmark className="mt-2 flex justify-center" />

        <p className="mx-auto mt-5 max-w-md text-lg text-slate-300">
          Card and party games for people who used to play at the same table, and
          do not live in the same place any more.
        </p>

        <Link
          href="/dashboard"
          className="mt-8 inline-block rounded-xl bg-amber-500 px-8 py-3.5 text-lg font-semibold text-slate-950 shadow-[0_0_30px_-8px_rgba(255,194,51,0.7)] transition hover:bg-amber-400"
        >
          {signedIn ? 'Open your dashboard' : 'Sign in to play'}
        </Link>

        <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-400">On the board</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {GAMES.map((game) => (
              <li
                key={game.id}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  game.status === 'live'
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-dashed border-slate-700 text-slate-400'
                }`}
              >
                <span className="font-medium">{game.name}</span>
                <span className="ml-2 text-xs opacity-70">
                  {game.status === 'live' ? 'playable' : 'soon'}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-400">
            One level across all of them — every game you play feeds the same record.
          </p>
        </div>
      </div>
    </main>
  );
}
