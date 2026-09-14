import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { PlayerCard } from '@/components/PlayerCard';
import { FeatGrid, MilestoneGrid, PartnerTable, StreakStrip } from '@/components/StatsPanels';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { exactly, timeSince } from '@/lib/relative-time';
import { getPlayerStats } from '@/lib/stats';
import type { RivalRecord } from '@/lib/stats-core';
import { earnedTitles, titleLabel } from '@/lib/titles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * One player's record, as everybody else sees it.
 *
 * Their card is the same card you wear on your own pages, carrying their level,
 * their band and their title — which is the strongest argument for the card
 * being one component rather than three drawings of a person.
 *
 * The same panels as your own stats page, minus the things that are yours to
 * act on — no title picker, no weekly challenges, since neither is anyone
 * else's business to change or chase. What is added is the one number you
 * actually came here for: how you do against them.
 */

/** Your head-to-head with the person you are looking at. */
function AgainstYou({ rival, name }: { rival: RivalRecord; name: string }) {
  const decided = rival.won + rival.lost;
  const mine = decided === 0 ? 50 : Math.round((rival.won / decided) * 100);
  // `rival` is read from YOUR matches, so `won` is yours and `lost` is theirs.
  const lead =
    rival.won === rival.lost
      ? `You and ${name} are level`
      : rival.won > rival.lost
        ? `You lead ${rival.won}–${rival.lost}`
        : `${name} leads ${rival.lost}–${rival.won}`;

  return (
    <div className="rounded-2xl border border-amber-300/30 bg-slate-900/80 p-4">
      <h2 className="text-lg font-semibold text-white">Against you</h2>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="w-6 text-[22px] font-bold tabular-nums text-emerald-300">{rival.won}</span>
        <div className="flex h-[7px] flex-1 overflow-hidden rounded-full bg-slate-950">
          <div className="bg-emerald-400" style={{ width: `${mine}%` }} />
          <div className="flex-1 bg-rose-400" />
        </div>
        <span className="w-6 text-right text-[22px] font-bold tabular-nums text-rose-300">
          {rival.lost}
        </span>
      </div>
      <p className="mt-1.5 text-center text-xs text-slate-500">
        {lead} over {rival.played} {rival.played === 1 ? 'match' : 'matches'}
      </p>
    </div>
  );
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const [player, me] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, name: true, image: true, avatar: true, title: true },
    }),
    prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }),
  ]);
  if (!player) notFound();

  const isMe = me?.id === player.id;

  const [{ stats, level, band, partners, milestones, feats }, lastPlayed, mine] = await Promise.all([
    getPlayerStats(player.id),
    prisma.match.findFirst({
      where: { status: 'FINISHED', gameId: 'MENDI_COAT', seats: { some: { userId: player.id } } },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    }),
    // Your own record, only to pull the head-to-head out of it. Skipped when
    // you are looking at yourself, where the question means nothing.
    !isMe && me ? getPlayerStats(me.id) : null,
  ]);

  const displayName = player.username ?? player.name ?? 'player';
  const wearing = titleLabel(player.title, earnedTitles(milestones, feats, band.name));
  const rival = mine?.rivals.find((entry) => entry.userId === player.id) ?? null;

  return (
    <main className="min-h-screen bg-slate-950 px-3 pb-10 pt-4 text-slate-100 sm:px-6 sm:pb-12 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-5">
        <AppHeader variant="slim" current="players" />

        <Link
          href="/players"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-400 transition hover:text-amber-300"
        >
          ← All players
        </Link>

        <div className="grid items-start gap-5 lg:grid-cols-[21rem_minmax(0,1fr)]">
          <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
            <PlayerCard
              userId={player.id}
              name={displayName}
              avatar={player.avatar}
              photo={player.image}
              wearing={wearing}
              level={level}
              band={band}
              stats={stats}
            />

            {rival ? <AgainstYou rival={rival} name={displayName} /> : null}

            <p className="text-center text-xs text-slate-500" title={exactly(lastPlayed?.finishedAt)}>
              Last played {timeSince(lastPlayed?.finishedAt) ?? 'never'}
            </p>

            {isMe ? (
              <Link
                href="/stats"
                className="rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-semibold text-amber-950 transition hover:bg-amber-300"
              >
                Your full stats →
              </Link>
            ) : null}
          </aside>

          <div className="flex min-w-0 flex-col gap-5">
            {stats.played === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
                <h2 className="text-xl font-semibold text-white">Career</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {displayName} has not finished a match yet.
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

            <MilestoneGrid milestones={milestones} />
            <FeatGrid feats={feats} />
            <PartnerTable partners={partners} />
          </div>
        </div>
      </div>
    </main>
  );
}
