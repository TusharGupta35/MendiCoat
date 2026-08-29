import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { AvatarPicker } from '@/components/AvatarPicker';
import { GameGrid } from '@/components/GameGrid';
import { Brand } from '@/components/Logo';
import { ProgressWatch } from '@/components/ProgressCelebration';
import { RecordCard, TopPlayers } from '@/components/StatsPanels';
import { UsernameEditor } from '@/components/UsernameEditor';
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
    <main className="min-h-screen bg-slate-950 px-3 py-6 text-slate-100 sm:px-6 sm:py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-8">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
          <Brand />

          {/* The player reads inward from the edge: name and title first, then
              the face at the far right, mirroring the brand at the far left. */}
          <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:justify-end">
            <div className="min-w-0 text-left sm:text-right">
              <UsernameEditor username={user?.username ?? null} fallbackName={accountName} />
              {wearing ? (
                <p className="text-sm font-medium text-amber-300">{wearing}</p>
              ) : null}
            </div>
            {user ? (
              <AvatarPicker
                avatar={user.avatar}
                userKey={user.id}
                name={user.username ?? accountName}
                photo={user.image}
                level={record?.level}
              />
            ) : null}
          </div>
        </header>

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
