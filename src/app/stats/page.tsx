import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { LevelAvatar } from '@/components/Avatar';
import { ProgressWatch } from '@/components/ProgressCelebration';
import {
  ChallengeList,
  FeatGrid,
  Leaderboard,
  LevelBadge,
  MilestoneGrid,
  PartnerTable,
  StreakStrip,
} from '@/components/StatsPanels';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { weekOf } from '@/lib/challenges';
import { snapshotFrom } from '@/lib/progress-feed';
import { getLeaderboard, getPlayerStats } from '@/lib/stats';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function StatsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, username: true, name: true, avatar: true, image: true },
  });
  if (!user) redirect('/login');

  const [{ stats, level, band, partners, milestones, feats, challenges }, leaderboard] =
    await Promise.all([
      getPlayerStats(user.id),
      getLeaderboard(),
    ]);

  const snapshot = snapshotFrom(level, milestones, feats, challenges, weekOf(new Date()));

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-6 text-slate-100 sm:px-6 sm:py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-8">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <LevelAvatar
                avatar={user.avatar}
                userKey={user.id}
                name={user.username ?? user.name ?? 'player'}
                photo={user.image}
                level={level.level}
                into={level.into}
                span={level.span}
                className="h-16 w-16"
              />
              <div>
                <p className="text-sm uppercase tracking-[0.35em] text-amber-400">Your record</p>
                <h1 className="text-3xl font-semibold text-white">
                  {user.username ?? user.name ?? 'player'}
                </h1>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-700 px-4 py-2 font-medium transition hover:bg-slate-800"
            >
              Back to dashboard
            </Link>
          </div>

          <div className="mt-5">
            <LevelBadge level={level} band={band} />
          </div>

          {stats.played === 0 ? (
            <p className="mt-5 text-sm text-slate-400">
              Nothing played yet — finish a match and your record starts here.
            </p>
          ) : (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-slate-950/70 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Matches</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{stats.played}</p>
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

        <ChallengeList challenges={challenges} />

        <MilestoneGrid milestones={milestones} />

        <FeatGrid feats={feats} />

        <section className="grid gap-6 lg:grid-cols-2">
          <PartnerTable partners={partners} />
          <Leaderboard rows={leaderboard} meId={user.id} />
        </section>
      </div>

      {snapshot ? <ProgressWatch snapshot={snapshot} /> : null}
    </main>
  );
}
