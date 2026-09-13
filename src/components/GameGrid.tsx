import Link from 'next/link';
import { GameEmblem } from '@/components/GameEmblem';
import { comingSoon, liveGames, type Game } from '@/games/registry';

/**
 * The board of games.
 *
 * It used to be five tiles in one column, all the same size — which meant three
 * of the five, the ones you cannot play, took the same space and the same
 * weight as the two you can. They are promises, not options, so they are a
 * strip along the bottom now, and the playable ones sit two across with room
 * for what they actually are.
 *
 * The whole tile is the link and the whole tile lights up: a button inside a
 * card that is itself about one game gives two targets for one intent.
 */

function LiveTile({ game }: { game: Game }) {
  return (
    <Link
      href={`/games/${game.slug}`}
      className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/80 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-amber-400/60 hover:bg-amber-500/[0.06] hover:shadow-[0_0_34px_-6px_rgba(255,194,51,0.4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 motion-reduce:transform-none"
    >
      <div className="flex items-start gap-3.5">
        <GameEmblem game={game} size="lg" className="group-hover:scale-110" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-white transition group-hover:text-amber-300">
              {game.name}
            </h3>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
              Playable
            </span>
          </div>
          <p className="text-sm text-amber-300">{game.tagline}</p>
        </div>
      </div>

      <p className="mt-3.5 text-sm leading-relaxed text-slate-400">{game.blurb}</p>

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <span className="text-sm font-medium text-amber-300 transition group-hover:text-amber-200">
          Play now{' '}
          <span className="inline-block transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none">
            →
          </span>
        </span>
        <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
          {game.players}
          {game.bots ? ' · bots' : ''}
        </span>
      </div>
    </Link>
  );
}

/**
 * The promised games, as a strip.
 *
 * Still named and still drawn — what the table will hold is part of the pitch —
 * but at a size that never pretends to be clickable.
 */
function SoonStrip({ games }: { games: Game[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-3">
      <p className="shrink-0 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
        On the way
      </p>
      <div className="flex min-w-0 flex-1 flex-wrap gap-2.5">
        {games.map((game) => (
          <div
            key={game.id}
            className="flex min-w-0 flex-1 basis-40 items-center gap-2.5 rounded-xl bg-slate-950/40 px-3 py-2"
            title={game.tagline}
          >
            <GameEmblem game={game} className="h-8 w-8 p-1.5" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-200">{game.name}</span>
              <span className="block truncate text-[11px] text-slate-500">{game.players}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GameGrid() {
  const live = liveGames();
  const soon = comingSoon();

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">Games</h2>
        <p className="text-[13px] text-slate-500">
          {live.length} playable · {soon.length} on the way
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {live.map((game) => (
          <LiveTile key={game.id} game={game} />
        ))}
      </div>

      {soon.length > 0 ? (
        <div className="mt-4">
          <SoonStrip games={soon} />
        </div>
      ) : null}
    </section>
  );
}
