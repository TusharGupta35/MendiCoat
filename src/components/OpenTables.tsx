import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { GameEmblem } from '@/components/GameEmblem';
import { TableActions } from '@/components/TableActions';
import type { Game } from '@/games/registry';
import type { OpenTable } from '@/lib/lobby';
import { timeSince } from '@/lib/relative-time';

/**
 * Who is at a table right now.
 *
 * The dashboard's reason to exist: five friends in five cities, and the only
 * question worth answering on sign-in is whether anybody is playing. The rooms
 * were always in the database; nothing outside the room page ever read them.
 *
 * A table with a seat free gets the gold button, because that is the one action
 * on this panel that changes your evening. A full or running table gets a quiet
 * one — you can still walk over and watch.
 */

/** The seats as faces, with the empty ones drawn as gaps rather than omitted. */
function Seats({ table }: { table: OpenTable }) {
  return (
    <div className="flex items-center gap-1.5">
      {table.players.slice(0, 7).map((player) => (
        <Avatar
          key={player.userId}
          avatar={player.avatar}
          userKey={player.userId}
          name={player.name}
          photo={player.image}
          className="h-6 w-6"
        />
      ))}
      {Array.from({ length: Math.min(table.seatsFree, 7) }).map((_, index) => (
        <span
          key={`free-${index}`}
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-amber-300/50"
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3">
            <path d="M12 5v14M5 12h14" stroke="#ffd970" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </span>
      ))}
    </div>
  );
}

function TableRow({ table }: { table: OpenTable }) {
  const joinable = table.status === 'LOBBY' && table.seatsFree > 0;

  return (
    <li
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border p-4 ${
        joinable ? 'border-amber-400/25 bg-slate-950/70' : 'border-slate-800 bg-slate-950/60'
      }`}
    >
      <GameEmblem game={table.game} className="h-11 w-11 p-2" />

      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-[17px] font-semibold text-white">{table.name}</p>
        <p className="truncate text-[13px] text-slate-400">
          {table.game.name} ·{' '}
          {table.status === 'PLAYING'
            ? 'in play'
            : table.seatsFree === 0
              ? 'table is full'
              : `waiting on ${table.seatsFree}`}
        </p>
      </div>

      <Seats table={table} />

      <p className="min-w-0 flex-1 basis-40 text-[13px] text-slate-500">
        {table.seatsTaken} of {table.game.maxPlayers} seated
        {timeSince(table.openedAt) ? ` · opened ${timeSince(table.openedAt)}` : ''}
      </p>

      <Link
        href={`/room/${table.code}`}
        className={`flex h-10 shrink-0 items-center rounded-xl px-5 text-sm font-medium transition ${
          joinable
            ? 'bg-amber-500 font-semibold text-amber-950'
            : 'border border-slate-700 text-slate-200 hover:bg-slate-800'
        }`}
      >
        {joinable ? 'Take the seat' : table.status === 'PLAYING' ? 'Watch' : 'Open'}
      </Link>
    </li>
  );
}

export function OpenTables({ tables, liveGames }: { tables: OpenTable[]; liveGames: Game[] }) {
  const seatsFree = tables.reduce(
    (total, table) => total + (table.status === 'LOBBY' ? table.seatsFree : 0),
    0,
  );

  return (
    <section className="rounded-2xl border border-amber-300/30 bg-slate-900/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Lit only when there is something to be lit about. */}
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${
              tables.length > 0
                ? 'bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.18),0_0_12px_rgba(52,211,153,0.8)]'
                : 'bg-slate-700'
            }`}
          />
          <h2 className="text-xl font-semibold text-white">Tables open now</h2>
          {tables.length > 0 ? (
            <span className="rounded-full bg-slate-950/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] tabular-nums text-slate-400">
              {seatsFree === 0 ? 'no free seats' : `${seatsFree} open ${seatsFree === 1 ? 'seat' : 'seats'}`}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <TableActions games={liveGames} />
      </div>

      {tables.length === 0 ? (
        // The empty state is the common one on a quiet night, so it says what
        // to do rather than only reporting that nothing is happening.
        <div className="mt-4 rounded-2xl border border-dashed border-amber-300/25 bg-slate-950/40 p-5 text-center">
          <p className="font-semibold text-slate-200">Nobody has a table open.</p>
          <p className="mt-1 text-sm text-slate-400">
            Start one and fill the empty seats with bots — the others can drop in as they come
            online.
          </p>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {tables.map((table) => (
            <TableRow key={table.code} table={table} />
          ))}
        </ul>
      )}
    </section>
  );
}
