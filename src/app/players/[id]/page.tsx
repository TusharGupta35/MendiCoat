import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { AppHeader } from '@/components/AppHeader';
import { notFound, redirect } from 'next/navigation';
import { LevelAvatar } from '@/components/Avatar';
import {
  FeatGrid,
  LevelBadge,
  MilestoneGrid,
  PartnerTable,
  StreakStrip,
} from '@/components/StatsPanels';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { exactly, timeSince } from '@/lib/relative-time';
import { getPlayerStats } from '@/lib/stats';
import { earnedTitles, titleLabel } from '@/lib/titles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * One player's record, as everybody else sees it.
 *
 * The same panels as your own stats page, minus the things that are yours to
 * act on — no title picker, no weekly challenges, since neither is anyone
 * else's business to change or chase. Partner records stay: who somebody wins
 * with is half of what makes a table interesting.
 */
export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const player = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, name: true, image: true, avatar: true, title: true },
  });
  if (!player) notFound();

  const { stats, level, band, partners, milestones, feats } = await getPlayerStats(player.id);
  const displayName = player.username ?? player.name ?? 'player';
  const wearing = titleLabel(player.title, earnedTitles(milestones, feats, band.name));

  const lastPlayed = await prisma.match.findFirst({
    where: { status: 'FINISHED', seats: { some: { userId: player.id } } },
    orderBy: { finishedAt: 'desc' },
    select: { finishedAt: true },
  });

  const isMe = session.user.email
    ? (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))
        ?.id === player.id
    : false;

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-6 text-slate-100 sm:px-6 sm:py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-8">
        <AppHeader />

        <header className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <LevelAvatar
                avatar={player.avatar}
                userKey={player.id}
                name={displayName}
                photo={player.image}
                level={level.level}
                into={level.into}
                span={level.span}
                className="h-16 w-16"
              />
              <div>
                <p className="text-sm uppercase tracking-[0.35em] text-amber-400">
                  {isMe ? 'You' : 'Player'}
                </p>
                <h1 className="text-3xl font-semibold text-white">{displayName}</h1>
                {wearing ? (
                  <p className="mt-0.5 text-sm font-medium text-amber-300">{wearing}</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500" title={exactly(lastPlayed?.finishedAt)}>
                  Last played {timeSince(lastPlayed?.finishedAt) ?? 'never'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/players"
                className="rounded-lg border border-slate-700 px-4 py-2 font-medium transition hover:bg-slate-800"
              >
                All players
              </Link>
              {/* Your own page has more on it — the title picker and this
                  week's challenges — so say so rather than showing a stranger's
                  view of yourself and leaving it at that. */}
              {isMe ? (
                <Link
                  href="/stats"
                  className="rounded-lg bg-amber-400 px-4 py-2 font-medium text-amber-950 transition hover:bg-amber-300"
                >
                  Your full stats
                </Link>
              ) : null}
            </div>
          </div>

          <div className="mt-5">
            <LevelBadge level={level} band={band} />
          </div>

          {stats.played === 0 ? (
            <p className="mt-5 text-sm text-slate-400">
              {displayName} has not finished a match yet.
            </p>
          ) : (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-slate-950/70 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Matches</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
                    {stats.played}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-950/70 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Won</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{stats.won}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{stats.winRate}% win rate</p>
                </div>
                <div className="rounded-lg bg-slate-950/70 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">10s captured</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
                    {stats.tensCaptured}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-950/70 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Coats</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
                    {stats.coatsDealt}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{stats.coatsTaken} taken</p>
                </div>
              </div>
              <div className="mt-3">
                <StreakStrip stats={stats} />
              </div>
            </>
          )}
        </header>

        <MilestoneGrid milestones={milestones} />

        <FeatGrid feats={feats} />

        <PartnerTable partners={partners} />
      </div>
    </main>
  );
}
