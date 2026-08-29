import Link from 'next/link';
import { GameEmblem } from '@/components/GameEmblem';
import { GAMES, type Game } from '@/lib/games';

/**
 * The dashboard's game picker: the left-hand column, and the first thing the
 * page is for.
 *
 * A promised game is shown the same size as a playable one, because the point
 * of the board is what this table will hold, not only what it holds today. What
 * separates them is the footer: one opens the game, the other says to wait.
 *
 * The tiles are a single stack rather than a grid — the column is narrow enough
 * that two across would squeeze every blurb into a paragraph of its own. The
 * whole tile lifts and glows under the cursor, which needs no javascript: with
 * four of them stacked, "which one am I on" should read from the corner of the
 * eye.
 */

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
    // The whole tile is the link, and the whole tile is what lights up: gold
    // glow, gold border, a small lift. A button inside a card that is itself
    // about one game gives two targets for one intent.
    <Link
      href={`/games/${game.slug}`}
      className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/80 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-amber-400/60 hover:bg-amber-500/[0.06] hover:shadow-[0_0_34px_-6px_rgba(255,194,51,0.4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 motion-reduce:transform-none sm:p-5"
    >
      <div className="flex items-start gap-3">
        <GameEmblem game={game} className="group-hover:scale-110" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white transition group-hover:text-amber-300">
              {game.name}
            </h3>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
              Playable
            </span>
          </div>
          <p className="text-sm text-amber-300">{game.tagline}</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-400">{game.blurb}</p>
      <Meta game={game} />

      {/* Says where the tile goes, without being the only thing that goes
          there. Rules and rooms live on that page: both mean something
          different per game. */}
      <p className="mt-4 text-sm font-medium text-amber-300 transition group-hover:text-amber-200">
        Play now — rules and rooms inside{' '}
        <span className="inline-block transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none">
          →
        </span>
      </p>
    </Link>
  );
}

function SoonTile({ game }: { game: Game }) {
  return (
    // Lights too, so the board feels alive under the cursor — but in violet
    // rather than gold, and without the lift, so it never promises a click.
    <div className="group flex flex-col rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-4 transition duration-200 hover:border-slate-700 hover:bg-slate-900/70 hover:shadow-[0_0_28px_-10px_rgba(173,152,205,0.45)] sm:p-5">
      <div className="flex items-start gap-3">
        <GameEmblem game={game} className="group-hover:scale-110" />
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
      <h2 className="text-xl font-semibold text-white">Games</h2>

      <div className="mt-4 space-y-4">
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
