import type { Route } from 'next';
import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { GameEmblem } from '@/components/GameEmblem';
import { DeleteRoomButton } from '@/components/DeleteRoomButton';
import { EnterCodeButton } from '@/components/EnterCodeButton';
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
 * Seeing a table is not being let into it. Yours is a door you have already
 * been through, so it opens on a click. Anybody else's is listed without its
 * code and asks for one, which is how joining worked before there was a list
 * to look at — the host shares the code with the people they want at the
 * table. What the row adds is the state the join route would answer with, so
 * you know before typing whether there is a seat at all.
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

/** The room code, or the fact that you have not been given it. */
function CodeChip({ table }: { table: OpenTable }) {
  if (table.code === null) {
    return (
      <span
        title="The host shares this table's code with the people they want at it"
        className="flex shrink-0 items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 font-display text-[13px] font-bold tracking-[0.18em] text-slate-500"
      >
        ····
      </span>
    );
  }

  return (
    <span className="shrink-0 rounded-md bg-amber-500/15 px-2 py-0.5 font-display text-[13px] font-bold tracking-[0.14em] tabular-nums text-amber-300">
      {table.code}
    </span>
  );
}

/** What the row says is going on, in the words the join route would use. */
const SUMMARY: Record<OpenTable['state'], (table: OpenTable) => string> = {
  open: (table) => `waiting on ${table.seatsFree}`,
  full: () => 'table is full',
  playing: () => 'in play',
  stale: () => 'left open',
};

/**
 * One table.
 *
 * Laid out by the width of the list it sits in, not the width of the screen:
 * the same row appears in a full-width dashboard panel and in half of a game
 * page's two-column grid, and a phone breakpoint cannot tell those apart. Below
 * @2xl (42rem of list) it is two lines — emblem, name and the controls on top,
 * seats and tally underneath — and the name is the part that gives way, so the
 * controls never wrap off to a line of their own.
 */
function TableRow({ table, meId }: { table: OpenTable; meId?: string }) {
  const iHost = meId !== undefined && table.hostId === meId;
  // The join route refuses a started match and a full table, so a row must not
  // offer what the server is about to take away. `state` is that same answer.
  const seatOpen = table.state === 'open';
  const lit = table.mine ? table.state !== 'stale' : seatOpen;

  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-2xl border bg-slate-950/60 p-3.5 @2xl:gap-x-4 @2xl:p-4 ${
        lit ? 'border-amber-400/25' : 'border-slate-800'
      }`}
    >
      <GameEmblem
        game={table.game}
        className="shrink-0 @max-2xl:h-10 @max-2xl:w-10 @max-2xl:p-1.5 @2xl:h-11 @2xl:w-11 @2xl:p-2"
      />

      {/* basis-0 in a narrow list: the name starts from nothing and takes what
          the emblem and the controls leave, truncating rather than pushing the
          controls onto a line of their own. */}
      <div className="min-w-0 flex-1 basis-0 @2xl:basis-48">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-semibold text-white @2xl:text-[17px]">
            {table.name}
          </p>
          <CodeChip table={table} />
        </div>
        <p className="truncate text-[13px] text-slate-400">
          {table.game.name} · {SUMMARY[table.state](table)}
        </p>
      </div>

      {/* In a narrow list this pair drops to a line of its own under the name
          and the controls, which is the difference between a row that wraps
          into four ragged pieces and one that reads as two. */}
      <div className="order-last flex w-full min-w-0 items-center gap-3 @2xl:order-none @2xl:w-auto @2xl:flex-1 @2xl:basis-40">
        <Seats table={table} />
        <p className="min-w-0 flex-1 truncate text-[12px] text-slate-500 @2xl:text-[13px]">
          {table.seatsTaken} of {table.game.maxPlayers} joined
          {timeSince(table.updatedAt) ? ` · active ${timeSince(table.updatedAt)}` : ''}
        </p>
      </div>

      {/* The row's controls travel as one group. As separate flex items, the
          host's Delete wrapped onto a line of its own at the left edge of a
          narrow card, away from the Open it belongs beside. */}
      <div className="flex shrink-0 items-center gap-2">
        {table.mine && table.code !== null ? (
          // You are already at this table, so the door is just a door — a match
          // in progress is a reason to hurry back, not a reason to keep you out.
          <Link
            href={`/room/${table.code}`}
            className={`flex h-10 shrink-0 items-center whitespace-nowrap rounded-xl px-3.5 text-[13px] font-medium transition @2xl:px-5 @2xl:text-sm ${
              table.state === 'playing'
                ? 'bg-amber-500 font-semibold text-amber-950'
                : 'border border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
          >
            {table.state === 'playing' ? 'Back to the table' : 'Open'}
          </Link>
        ) : seatOpen ? (
          <EnterCodeButton />
        ) : (
          // No seat to take: say which, rather than offering a button that would
          // only be refused.
          <span className="flex h-10 shrink-0 items-center whitespace-nowrap px-1.5 text-[13px] text-slate-500 sm:px-2">
            {table.state === 'playing' ? 'In play' : table.state === 'full' ? 'Full' : 'Left open'}
          </span>
        )}
        {iHost && table.code !== null ? <DeleteRoomButton roomCode={table.code} /> : null}
      </div>
    </li>
  );
}

export function OpenTables({
  tables,
  liveGames,
  meId,
  heading = 'Tables open now',
  blurb,
  actions = true,
  moreHref,
  moreLabel = 'All tables →',
  empty,
}: {
  tables: OpenTable[];
  liveGames: Game[];
  /** Pass to offer the host their own table's delete control. */
  meId?: string;
  /** A game's own page names the game; the dashboard speaks for all of them. */
  heading?: string;
  /** A line under the heading, where the split needs explaining. */
  blurb?: string;
  /** The start/join controls belong on the first panel of a page, not each. */
  actions?: boolean;
  /** Where the full list lives, when this panel is only showing the top of it. */
  moreHref?: Route;
  moreLabel?: string;
  empty?: React.ReactNode;
}) {
  const going = tables.filter((table) => table.state !== 'stale');
  const seatsFree = tables.reduce(
    (total, table) => total + (table.state === 'open' ? table.seatsFree : 0),
    0,
  );

  return (
    <section className="rounded-2xl border border-amber-300/30 bg-slate-900/80 p-4 max-sm:p-3.5 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Lit only when there is something to be lit about. */}
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${
              going.length > 0
                ? 'bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.18),0_0_12px_rgba(52,211,153,0.8)]'
                : 'bg-slate-700'
            }`}
          />
          <h2 className="text-xl font-semibold text-white max-sm:text-lg">{heading}</h2>
          {going.length > 0 ? (
            <span className="rounded-full bg-slate-950/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] tabular-nums text-slate-400">
              {seatsFree === 0 ? 'no free seats' : `${seatsFree} open ${seatsFree === 1 ? 'seat' : 'seats'}`}
            </span>
          ) : null}
        </div>

        {moreHref ? (
          <Link
            href={moreHref}
            className="text-sm font-medium text-amber-300 transition hover:text-amber-200"
          >
            {moreLabel}
          </Link>
        ) : null}
      </div>

      {blurb ? <p className="mt-1 text-sm text-slate-400">{blurb}</p> : null}

      {actions ? (
        <div className="mt-4 max-sm:mt-3">
          <TableActions games={liveGames} />
        </div>
      ) : null}

      {tables.length === 0 ? (
        // The empty state is the common one on a quiet night, so it says what
        // to do rather than only reporting that nothing is happening.
        <div className="mt-4 rounded-2xl border border-dashed border-amber-300/25 bg-slate-950/40 p-5 text-center max-sm:mt-3 max-sm:p-3.5">
          {empty ?? (
            <>
              <p className="font-semibold text-slate-200">Nobody has a table open.</p>
              <p className="mt-1 text-sm text-slate-400">
                Start one and fill the empty seats with bots — the others can drop in as they come
                online.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="@container mt-4 flex flex-col gap-2.5 max-sm:mt-3 max-sm:gap-2">
          {tables.map((table) => (
            <TableRow key={table.id} table={table} meId={meId} />
          ))}
        </ul>
      )}
    </section>
  );
}
