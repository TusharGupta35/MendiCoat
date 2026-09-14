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
import { getTables } from '@/lib/lobby';
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

  // No minimum wait. There used to be a 2s floor here to hold the loading
  // screen up, but it also ran on every router.refresh() — saving your avatar
  // or name, deleting a table — where no loading screen shows, so the page just
  // froze for two seconds. The loading screen now shows the instant a link is
  // clicked (see NavigationLoader) and for exactly as long as this takes.
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) redirect('/login');

  const accountName = user.username ?? user.name ?? session.user.name ?? 'player';

  const [record, top, tables, activity] = await Promise.all([
    getPlayerStats(user.id),
    getXpLeaderboard(5),
    getTables(user.id, { limit: 24 }),
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

  // Yours first and always — a table you are already at is the one thing on
  // this page you can act on without asking anybody. Then everybody else's.
  // The rest lives on /tables.
  //
  // The newest three of each, whatever state they are in. Hiding the ones
  // nobody has touched in hours emptied the panels on any evening the rooms
  // were left over from the night before, which is most of them — and a row
  // already says "left open" for itself. Rows arrive newest first, so a table
  // still going always outranks a leftover anyway.
  const yours = tables.mine.slice(0, 3);
  const others = tables.global.slice(0, 3);

  return (
    <main className="min-h-screen bg-slate-950 px-3 pb-10 pt-4 text-slate-100 sm:px-6 sm:pb-12 sm:pt-6">
      {/* Wider than the old max-w-5xl: at 1024px a desktop was ~400px of empty
          plum down each side, and the rail needs a column of its own without
          squeezing everything else into one. */}
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 sm:gap-5">
        <AppHeader variant="slim" />

        {/* Two columns from lg up. Below that it is one stack, and both halves
            go `display: contents` so every panel becomes a direct child of it
            and can be ordered independently — the player card, then the two
            things you can act on, then the week, then everything you read
            rather than do. A phone otherwise made you scroll the whole rail
            before reaching a table. */}
        <div className="flex flex-col gap-4 sm:gap-5 lg:grid lg:items-start lg:gap-5 lg:grid-cols-[21rem_minmax(0,1fr)]">
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

          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
            <div className="order-2 lg:order-none">
              <OpenTables
                tables={yours}
                liveGames={liveGames()}
                meId={user.id}
                heading="Your tables"
                moreHref="/tables"
                empty={
                  <>
                    <p className="font-semibold text-slate-200">You are not at a table.</p>
                    <p className="mt-1 text-sm text-slate-400">
                      Start one and fill the empty seats with bots — the others can drop in as they
                      come online.
                    </p>
                  </>
                }
              />
            </div>

            <div className="order-3 lg:order-none">
              <OpenTables
                tables={others}
                liveGames={liveGames()}
                meId={user.id}
                heading="Open now"
                actions={false}
                moreHref="/tables"
                empty={
                  <p className="text-sm text-slate-400">
                    Nobody else has a table open right now.
                  </p>
                }
              />
            </div>

            <div className="order-5 lg:order-none">
              <GameGrid />
            </div>

            <div className="order-6 grid items-start gap-4 sm:gap-5 lg:order-none xl:grid-cols-2">
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
