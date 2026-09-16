import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { GameHero } from '@/components/GameHero';
import { OpenTables } from '@/components/OpenTables';
import { uiFor } from '@/games/ui';
import { authOptions } from '@/lib/auth';
import { getTables } from '@/lib/lobby';
import { prisma } from '@/lib/prisma';
import { getPlayerStats } from '@/lib/stats';
import { gameBySlug } from '@/games/registry';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * One game's own page: how it is played, and the tables it is played at.
 *
 * Everything here is particular to a single game, which is why it is not on the
 * dashboard. The dashboard answers "what shall I play"; this answers "how does
 * this one go, and where is the table".
 *
 * It opens like the game's own title screen (GameHero), then the tables and
 * your record, then the rules. It wears the same bar and width as every other
 * page, and it reuses the dashboard's own tables panel rather than growing a
 * second way of showing a room — a table should not change shape depending on
 * which page you found it on.
 */

type MedalMetal = 'gold' | 'silver' | 'bronze' | 'plum';

/** Gradient stops per metal, the podium's own on /players. */
const METAL_STOPS: Record<MedalMetal, [string, string, string]> = {
  gold: ['#fff1b8', '#ffc233', '#9a5c07'],
  silver: ['#ffffff', '#b8c3d1', '#566273'],
  bronze: ['#f8d9bb', '#c98b52', '#6b3f1c'],
  plum: ['#cdc0e4', '#8d76b2', '#35234f'],
};

/**
 * One number from your record, hung on a medal.
 *
 * The record used to be four plain tiles; on a page drawn as a title screen it
 * reads as a trophy shelf instead. Coats dealt is the gold one, because a coat
 * is the thing the game is named for.
 */
function RecordMedal({
  label,
  value,
  hint,
  metal,
}: {
  label: string;
  value: string;
  hint?: string;
  metal: MedalMetal;
}) {
  const gradient = `game-medal-${metal}`;
  const [light, mid, dark] = METAL_STOPS[metal];
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border bg-slate-950/60 p-2.5 sm:gap-3.5 sm:p-4 ${
        metal === 'gold' ? 'border-amber-400/30' : 'border-slate-800'
      }`}
    >
      <svg
        viewBox="0 0 44 50"
        aria-hidden="true"
        className="h-[34px] w-[30px] shrink-0 drop-shadow-[0_6px_10px_rgba(0,0,0,0.55)] sm:h-[50px] sm:w-11"
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={light} />
            <stop offset="0.5" stopColor={mid} />
            <stop offset="1" stopColor={dark} />
          </linearGradient>
        </defs>
        <path d="M6 0h11l10 21H16z" fill="#b4233c" />
        <path d="M38 0H27L17 21h11z" fill="#dc3a55" />
        <circle cx="22" cy="33" r="15" fill={`url(#${gradient})`} />
        <circle cx="22" cy="33" r="11.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      </svg>
      <div className="min-w-0">
        <p className="truncate text-[9px] font-medium uppercase tracking-[0.12em] text-slate-400 sm:text-[11px] sm:tracking-[0.16em]">
          {label}
        </p>
        <p
          className={`font-display text-[22px] font-bold leading-tight tabular-nums sm:text-3xl ${
            metal === 'gold' ? 'text-amber-300' : 'text-white'
          }`}
        >
          {value}
        </p>
        {hint ? <p className="truncate text-[11px] text-slate-500 sm:text-xs">{hint}</p> : null}
      </div>
    </div>
  );
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = gameBySlug(slug);
  if (!game) notFound();
  // A game that is not built yet has no rules to read and no room to sit in;
  // its tile on the dashboard is the whole of it for now.
  if (game.status !== 'live') notFound();
  const { Instructions } = uiFor(game.id);

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) redirect('/login');

  // Only Mendi Coat writes Match rows, so it is the only game that can honestly
  // show a record here. The others get the rules and the tables until they do.
  const tracked = game.id === 'MENDI_COAT';
  const [tables, record] = await Promise.all([
    getTables(user.id, { limit: 24, gameId: game.id }),
    tracked ? getPlayerStats(user.id) : null,
  ]);

  return (
    <main className="min-h-screen bg-slate-950 px-3 pb-10 pt-4 text-slate-100 sm:px-6 sm:pb-12 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 sm:gap-5">
        <AppHeader variant="slim" />

        {/* A step back up, read as a breadcrumb above the game rather than a
            button beside it — as a button it competed with "Start a table". */}
        <Link
          href="/dashboard"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-slate-400 transition hover:text-amber-300"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          All games
        </Link>

        <GameHero game={game} />

        {/* Starting and joining live in the hero now, so neither tables panel
            repeats the buttons. Mendi Coat has a record to put beside its
            tables; a game without one lays its two tables panels side by side. */}
        <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
            <OpenTables
              tables={tables.mine}
              liveGames={[game]}
              meId={user.id}
              heading="Your tables"
              actions={false}
              moreHref="/tables"
              empty={
                <p className="text-sm text-slate-400">
                  You have no {game.name} table open. Start one above.
                </p>
              }
            />
            {record ? (
              <OpenTables
                tables={tables.global}
                liveGames={[game]}
                meId={user.id}
                heading="Open now"
                actions={false}
                empty={
                  <p className="text-sm text-slate-400">
                    Nobody else has a {game.name} table open right now.
                  </p>
                }
              />
            ) : null}
          </div>

          {record ? (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-white sm:text-xl">Your record here</h2>
                <Link
                  href="/stats"
                  className="text-sm font-medium text-amber-300 transition hover:text-amber-200"
                >
                  Full stats →
                </Link>
              </div>
              {record.stats.played === 0 ? (
                <p className="mt-4 text-sm text-slate-400">
                  No finished matches yet. Play one and the XP starts here.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3">
                  <RecordMedal
                    label="Played"
                    value={String(record.stats.played)}
                    hint={record.stats.played === 1 ? 'match' : 'matches'}
                    metal="plum"
                  />
                  <RecordMedal
                    label="Won"
                    value={String(record.stats.won)}
                    hint={`${record.stats.winRate}% win rate`}
                    metal="bronze"
                  />
                  <RecordMedal
                    label="10s captured"
                    value={String(record.stats.tensCaptured)}
                    hint={`in ${record.stats.played} ${record.stats.played === 1 ? 'match' : 'matches'}`}
                    metal="silver"
                  />
                  <RecordMedal
                    label="Coats dealt"
                    value={String(record.stats.coatsDealt)}
                    hint={`${record.stats.coatsTaken} taken`}
                    metal="gold"
                  />
                </div>
              )}
            </section>
          ) : (
            <OpenTables
              tables={tables.global}
              liveGames={[game]}
              meId={user.id}
              heading="Open now"
              actions={false}
              empty={
                <p className="text-sm text-slate-400">
                  Nobody else has a {game.name} table open right now.
                </p>
              }
            />
          )}
        </div>

        {/* The real rules, per game — richer and more accurate than anything
            this page could restate about a game it does not know. */}
        <Instructions />
      </div>
    </main>
  );
}
