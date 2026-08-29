import Link from 'next/link';
import { GAMES, type Game } from '@/lib/games';

/**
 * The dashboard's game picker.
 *
 * A promised game is shown the same size as a playable one, because the point
 * of the board is what this table will hold, not only what it holds today. What
 * separates them is the footer: one opens the game, the other says to wait.
 */

function Emblem({ game }: { game: Game }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl ${game.accent}`}
    >
      {game.emblem}
    </span>
  );
}

function Meta({ game }: { game: Game }) {
  return (
    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">
      {game.players}
      {game.bots ? ' · bots available' : ' · needs a full table'}
    </p>
  );
}

function LiveTile({ game }: { game: Game }) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Emblem game={game} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{game.name}</h3>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
              Playable
            </span>
          </div>
          <p className="text-sm text-amber-300">{game.tagline}</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-400">{game.blurb}</p>
      <Meta game={game} />

      {/* The tile only opens the game. Its rules and its rooms live on the
          game's own page, because both mean something different per game. */}
      <div className="mt-4">
        <Link
          href={`/games/${game.slug}`}
          className="inline-block rounded-lg bg-amber-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-amber-400"
        >
          Play {game.name}
        </Link>
      </div>
    </div>
  );
}

function SoonTile({ game }: { game: Game }) {
  return (
    <div className="flex flex-col rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Emblem game={game} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-200">{game.name}</h3>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Coming soon
            </span>
          </div>
          <p className="text-sm text-slate-400">{game.tagline}</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-500">{game.blurb}</p>
      <Meta game={game} />
    </div>
  );
}

export function GameGrid() {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold text-white">Games</h2>
        <p className="text-sm text-slate-400">
          One level across all of them — every game you play feeds the same record.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {GAMES.map((game) =>
          game.status === 'live' ? (
            <LiveTile key={game.id} game={game} />
          ) : (
            <SoonTile key={game.id} game={game} />
          ),
        )}
      </div>
    </section>
  );
}
