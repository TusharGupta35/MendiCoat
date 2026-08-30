import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { exactly, timeSince } from '@/lib/relative-time';
import { podiumFor } from '@/lib/podium';
import { getXpLeaderboard } from '@/lib/stats';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Everybody who has played here, in level order.
 *
 * The dashboard board is the top five, which is the wrong list for the question
 * "how am I doing against everyone" — this is that list, and every row opens
 * the player behind it.
 */
export default async function PlayersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const [me, players] = await Promise.all([
    prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }),
    // Everyone, not a page of them: this is five friends and their guests, and
    // a list that never needs a second page should not have one.
    getXpLeaderboard(100),
  ]);

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-6 text-slate-100 sm:px-6 sm:py-12">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 sm:gap-8">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-amber-400">Players</p>
              <h1 className="mt-1 text-3xl font-semibold text-white">Everyone at the table</h1>
              <p className="mt-2 text-sm text-slate-400">
                Ranked by XP, which every game pays into. {players.length}{' '}
                {players.length === 1 ? 'player has' : 'players have'} finished a match here.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-700 px-4 py-2 font-medium transition hover:bg-slate-800"
            >
              Back to dashboard
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
          {players.length === 0 ? (
            <p className="text-sm text-slate-400">
              Nobody has finished a match yet. Play one and this list starts with you.
            </p>
          ) : (
            <ol className="space-y-2">
              {players.map((player, index) => {
                const podium = podiumFor(index);
                const isMe = player.userId === me?.id;
                return (
                <li key={player.userId}>
                  <Link
                    href={`/players/${player.userId}`}
                    className={`flex items-center gap-3 rounded-lg p-3 transition hover:bg-slate-800 ${
                      podium?.row ?? 'bg-slate-950/70'
                    } ${
                      // Your own row is marked wherever it lands, and on the
                      // podium the medal already colours it, so it takes a
                      // dashed edge instead of a second ring fighting the first.
                      isMe ? (podium ? 'ring-dashed' : 'bg-amber-500/10 ring-1 ring-amber-400/40') : ''
                    }`}
                  >
                    {podium ? (
                      <span
                        aria-hidden="true"
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${podium.badge}`}
                      >
                        {index + 1}
                      </span>
                    ) : (
                      <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-slate-500">
                        {index + 1}
                      </span>
                    )}
                    <Avatar
                      avatar={player.avatar}
                      userKey={player.userId}
                      name={player.name}
                      className="h-9 w-9"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-white">{player.name}</span>
                      <span
                        className="block truncate text-xs text-slate-500"
                        title={exactly(player.lastPlayed)}
                      >
                        {player.band} · {player.played}{' '}
                        {player.played === 1 ? 'match' : 'matches'} ·{' '}
                        {timeSince(player.lastPlayed) ?? 'no matches yet'}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums text-amber-300">
                        Level {player.level}
                      </span>
                      <span className="block text-xs tabular-nums text-slate-500">
                        {player.totalXp.toLocaleString()} XP
                      </span>
                    </span>
                  </Link>
                </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
