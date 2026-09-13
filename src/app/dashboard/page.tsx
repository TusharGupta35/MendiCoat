import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { ActivityFeed } from '@/components/ActivityFeed';
import { GameGrid } from '@/components/GameGrid';
import { OpenTables } from '@/components/OpenTables';
import { PlayerRail } from '@/components/PlayerRail';
import { ProgressWatch } from '@/components/ProgressCelebration';
import { TopPlayers } from '@/components/StatsPanels';
import { liveGames } from '@/games/registry';
import { getRecentActivity } from '@/lib/activity';
import { authOptions } from '@/lib/auth';
import { weekOf } from '@/lib/challenges';
import { getOpenTables } from '@/lib/lobby';
import { prisma } from '@/lib/prisma';
import { snapshotFrom } from '@/lib/progress-feed';
import { getPlayerStats, getXpLeaderboard, type XpRow } from '@/lib/stats';
import type { RivalRecord } from '@/lib/stats-core';
import { earnedTitles, titleLabel } from '@/lib/titles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Who to chase.
 *
 * The player directly above you on the XP board, or — once you are top — the
 * one directly below. Ranked by XP rather than by how often you play them: the
 * rival worth naming is the one you could actually overtake this week. The
 * head-to-head is read off matches already loaded for your own record, so
 * naming a rival costs no extra query.
 */
function closestRival(board: XpRow[], meId: string, rivals: RivalRecord[]) {
  const mine = board.findIndex((row) => row.userId === meId);
  if (mine === -1) return { rival: null, xpGap: 0 };

  const neighbour = board[mine - 1] ?? board[mine + 1];
  if (!neighbour) return { rival: null, xpGap: 0 };

  const record = rivals.find((entry) => entry.userId === neighbour.userId);
  return {
    rival: record ?? {
      userId: neighbour.userId,
      name: neighbour.name,
      avatar: neighbour.avatar,
      ...(neighbour.image ? { image: neighbour.image } : {}),
      played: 0,
      won: 0,
      lost: 0,
    },
    xpGap: neighbour.totalXp - board[mine].totalXp,
  };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  // Hold the branded loading screen for a minimum ~2s, overlapped with the
  // query so it's the floor, not added on top of it.
  const [, user] = await Promise.all([
    new Promise((resolve) => setTimeout(resolve, 2000)),
    prisma.user.findUnique({ where: { email: session.user.email } }),
  ]);
  if (!user) redirect('/login');

  const accountName = user.username ?? user.name ?? session.user.name ?? 'player';

  const [record, top, tables, activity] = await Promise.all([
    getPlayerStats(user.id),
    getXpLeaderboard(5),
    getOpenTables(),
    getRecentActivity(user.id, 5),
  ]);

  const wearing = titleLabel(
    user.title,
    earnedTitles(record.milestones, record.feats, record.band.name),
  );
  // Built from the stats already loaded, so the celebration costs no extra query.
  const snapshot = snapshotFrom(
    record.level,
    record.milestones,
    record.feats,
    record.challenges,
    weekOf(new Date()),
  );
  const { rival, xpGap } = closestRival(top, user.id, record.rivals);

  return (
    <main className="min-h-screen bg-slate-950 px-3 pb-10 pt-4 text-slate-100 sm:px-6 sm:pb-12 sm:pt-6">
      {/* Wider than the old max-w-5xl: at 1024px a desktop was ~400px of empty
          plum down each side, and the rail needs a column of its own without
          squeezing everything else into one. */}
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-5">
        <AppHeader variant="slim" />

        {/* The rail first in the source as well as on screen: on a phone the
            grid collapses to one column and identity should still lead, which
            is the whole point of this layout. */}
        <div className="grid items-start gap-5 lg:grid-cols-[21rem_minmax(0,1fr)]">
          <PlayerRail
            userId={user.id}
            name={accountName}
            avatar={user.avatar}
            photo={user.image}
            wearing={wearing}
            level={record.level}
            band={record.band}
            stats={record.stats}
            challenges={record.challenges}
            rival={rival}
            rivalXpGap={xpGap}
          />

          <div className="flex min-w-0 flex-col gap-5">
            <OpenTables tables={tables} liveGames={liveGames()} />
            <GameGrid />
            <div className="grid items-start gap-5 xl:grid-cols-2">
              <TopPlayers rows={top} meId={user.id} />
              <ActivityFeed entries={activity} />
            </div>
          </div>
        </div>
      </div>

      <ProgressWatch snapshot={snapshot} />
    </main>
  );
}
