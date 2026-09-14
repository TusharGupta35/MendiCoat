import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { PlayerCard } from '@/components/PlayerCard';
import { TitlePicker } from '@/components/TitlePicker';
import { ProgressWatch } from '@/components/ProgressCelebration';
import {
  ChallengeList,
  FeatGrid,
  Leaderboard,
  MilestoneGrid,
  PartnerTable,
  StreakStrip,
  WeeklyTopFive,
} from '@/components/StatsPanels';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { weekOf } from '@/lib/challenges';
import { snapshotFrom } from '@/lib/progress-feed';
import { getLeaderboard, getPlayerStats, getWeeklyLeaderboard } from '@/lib/stats';
import { earnedTitles, titleLabel } from '@/lib/titles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Your record in full.
 *
 * Same shape as the dashboard — identity in a left rail, everything you can
 * read in the right column — and the rail is literally the same card. That is
 * the point of the card being one component: who you are should not be drawn
 * two different ways on two pages of the same app.
 *
 * What the dashboard shows in miniature (the week, the board) is here in full,
 * plus the things that only belong on your own page: the title you wear, your
 * milestones, your feats and your partners.
 */
export default async function StatsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, username: true, name: true, avatar: true, image: true, title: true },
  });
  if (!user) redirect('/login');

  const [{ stats, level, band, partners, milestones, feats, challenges }, leaderboard, weekly] =
    await Promise.all([getPlayerStats(user.id), getLeaderboard(), getWeeklyLeaderboard(5)]);

  const snapshot = snapshotFrom(level, milestones, feats, challenges, weekOf(new Date()));
  const titles = earnedTitles(milestones, feats, band.name);
  const wearing = titleLabel(user.title, titles);
  const name = user.username ?? user.name ?? 'player';

  return (
    <main className="min-h-screen bg-slate-950 px-3 pb-10 pt-4 text-slate-100 sm:px-6 sm:pb-12 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-5">
        <AppHeader variant="slim" current="record" />

        <div className="grid items-start gap-5 lg:grid-cols-[21rem_minmax(0,1fr)]">
          <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
            <PlayerCard
              userId={user.id}
              name={name}
              avatar={user.avatar}
              photo={user.image}
              wearing={wearing}
              level={level}
              band={band}
              stats={stats}
            />

            {/* The one thing on the card you choose lives directly under it. */}
            <TitlePicker titles={titles} current={user.title} />

            <Link
              href="/players"
              className="rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-medium text-slate-200 transition hover:bg-slate-800"
            >
              All players →
            </Link>
          </aside>

          <div className="flex min-w-0 flex-col gap-5">
            {stats.played === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
                <h2 className="text-xl font-semibold text-white">Career</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Nothing played yet — finish a match and your record starts here.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
                <h2 className="text-xl font-semibold text-white">Career</h2>
                <div className="mt-4">
                  <StreakStrip stats={stats} />
                </div>
              </div>
            )}

            <ChallengeList challenges={challenges} />
            <MilestoneGrid milestones={milestones} />
            <FeatGrid feats={feats} />

            <div className="grid items-start gap-5 xl:grid-cols-2">
              <PartnerTable partners={partners} />
              <Leaderboard rows={leaderboard} meId={user.id} />
              <WeeklyTopFive rows={weekly} meId={user.id} />
            </div>
          </div>
        </div>
      </div>

      <ProgressWatch snapshot={snapshot} />
    </main>
  );
}
