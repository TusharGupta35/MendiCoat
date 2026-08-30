import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { GameGrid } from '@/components/GameGrid';
import { ProgressWatch } from '@/components/ProgressCelebration';
import { RecordCard, TopPlayers } from '@/components/StatsPanels';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { weekOf } from '@/lib/challenges';
import { snapshotFrom } from '@/lib/progress-feed';
import { earnedTitles, titleLabel } from '@/lib/titles';
import { getPlayerStats, getXpLeaderboard } from '@/lib/stats';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  // Hold the branded loading screen for a minimum ~2s, overlapped with the
  // query so it's the floor, not added on top of it.
  const [, user] = await Promise.all([
    new Promise((resolve) => setTimeout(resolve, 2000)),
    prisma.user.findUnique({
      where: { email: session.user.email },
    }),
  ]);
  const accountName = user?.name ?? session.user.name ?? 'player';
  const [record, top] = await Promise.all([
    user ? getPlayerStats(user.id) : null,
    getXpLeaderboard(5),
  ]);
  // Built from the stats already loaded, so the celebration costs no extra query.
  const snapshot = record
    ? snapshotFrom(record.level, record.milestones, record.feats, record.challenges, weekOf(new Date()))
    : null;
  const wearing =
    record && user
      ? titleLabel(user.title, earnedTitles(record.milestones, record.feats, record.band.name))
      : null;

  return (
    <main className="min-h-screen bg-slate-950 px-3 pb-8 pt-4 text-slate-100 sm:px-6 sm:pb-12 sm:pt-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-8">
        <AppHeader level={record?.level} wearing={wearing} />

        {/* Games on the left because picking one is what this page is for; the
            record and the board on the right, where they read as standings
            rather than as something to act on. */}
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <GameGrid />

          <div className="flex flex-col gap-6">
            {record ? (
              <RecordCard stats={record.stats} level={record.level} band={record.band} />
            ) : null}

            <TopPlayers rows={top} meId={user?.id ?? ''} />
          </div>
        </section>
      </div>

      {snapshot ? <ProgressWatch snapshot={snapshot} /> : null}
    </main>
  );
}
