import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { GameEmblem } from '@/components/GameEmblem';
import { OpenTables } from '@/components/OpenTables';
import { GameInstructions } from '@/games/mendi-coat/Instructions';
import { TigdiInstructions } from '@/games/teen-ki-tigdi/Instructions';
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
 * It wears the same bar, the same width and the same panels as every other
 * page, and it reuses the dashboard's own tables panel rather than growing a
 * second way of showing a room — a table should not change shape depending on
 * which page you found it on.
 */

/** A small labelled number, for the record strip. */
function Stat({ label, value, hint, gold = false }: {
  label: string;
  value: string;
  hint?: string;
  gold?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        gold ? 'border-amber-400/30 bg-amber-500/[0.09]' : 'border-amber-400/[0.08] bg-slate-950/60'
      }`}
    >
      <p className={`text-[11px] font-medium uppercase tracking-[0.14em] ${gold ? 'text-amber-300/80' : 'text-slate-400'}`}>
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${gold ? 'text-amber-300' : 'text-white'}`}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
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
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-5">
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

        <section className="relative overflow-hidden rounded-2xl border border-amber-300/30 bg-slate-900/80 p-5 sm:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_90%_at_88%_0%,rgba(245,166,21,0.2),transparent_62%)]"
          />
          <div className="relative flex flex-wrap items-start gap-5">
            <GameEmblem game={game} size="xl" />

            <div className="min-w-0 flex-1 basis-96">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-3xl font-semibold text-white sm:text-4xl">{game.name}</h1>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                  Playable
                </span>
              </div>
              <p className="mt-1 text-[17px] font-medium text-amber-300">{game.tagline}</p>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">{game.blurb}</p>
              <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                {game.players}
                {game.bots ? ' · bots available' : ' · needs a full table'}
              </p>
            </div>
          </div>
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* The real rules, per game — richer and more accurate than anything
              this page could restate about a game it does not know. */}
          {game.id === 'TEEN_KI_TIGDI' ? <TigdiInstructions /> : <GameInstructions />}

          <div className="flex min-w-0 flex-col gap-5">
            {/* Only this game's tables, and only this game offered when opening
                one — you came here to play this. */}
            <OpenTables
              tables={tables.mine}
              liveGames={[game]}
              meId={user.id}
              heading={`Your ${game.name} tables`}
              empty={
                <p className="text-sm text-slate-400">
                  You have no {game.name} table open. Start one above.
                </p>
              }
            />
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

            {record ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-semibold text-white">Your record here</h2>
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
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Stat label="Played" value={String(record.stats.played)} />
                    <Stat
                      label="Won"
                      value={String(record.stats.won)}
                      hint={`${record.stats.winRate}% win rate`}
                    />
                    <Stat label="10s captured" value={String(record.stats.tensCaptured)} />
                    <Stat
                      label="Coats dealt"
                      value={String(record.stats.coatsDealt)}
                      hint={`${record.stats.coatsTaken} taken`}
                      gold
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
