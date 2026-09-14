import { gameForRoom, type Game } from '@/games/registry';

/**
 * What a room row means to the player looking at it.
 *
 * Pure and database-free, so the rules worth testing — which codes are printed
 * and whether a seat is really open — can be proved without a database. The
 * same split stats-core and activity-core already use.
 *
 * Tables come back in two piles, because they answer different questions.
 * Yours — hosted or already sat at — are places you can simply walk back into.
 * Everybody else's you have to be let into, and the code the host sent you is
 * what does the letting in, exactly as it did before there was a table list.
 * So a table that is not yours is listed without its code: you can see that it
 * exists, who is at it and whether a seat is free, and joining still means
 * having been told the code.
 */

/**
 * How long a room goes untouched before it goes quiet.
 *
 * Nothing ever deletes a room — the host has to — and the socket server resets
 * every PLAYING row to LOBBY when it boots, so an abandoned match comes back
 * looking joinable. A week is long enough that a regular table between game
 * nights never disappears, and short enough that a room nobody came back to
 * stops cluttering everybody's list.
 *
 * "Touched" is a write to the room row: created, joined, or a match starting
 * or ending. Opening the room page alone is not one.
 */
export const FRESH_FOR_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What the join route will do with this table if somebody tries.
 *
 * These are the three answers /api/rooms/join already gives, named so a row
 * can show the same thing the server would say rather than guess at it:
 *
 *  - `open`    — in its lobby with a free seat; a code gets you in.
 *  - `full`    — every seat taken. "This room is already full."
 *  - `playing` — a match is under way. "This game has already started."
 *
 * `stale` is the one the server has no opinion about: the row is untouched for
 * a week, so whatever it claims, nobody is sitting there waiting.
 */
export type TableState = 'open' | 'full' | 'playing' | 'stale';

export interface OpenTable {
  /**
   * A stable key for a row, since a table you are not in has no code to key on.
   * Not a credential — joining still needs the code.
   */
  id: string;
  /**
   * Null unless the table is yours.
   *
   * The code is the way in, so printing it beside somebody else's table would
   * hand out invitations the host never sent. Where this is null, the row has
   * to ask for a code rather than offer a way through.
   */
  code: string | null;
  name: string;
  game: Game;
  /** So the host can be offered the one control nobody else gets. */
  hostId: string;
  /** What would happen if you tried to sit down. */
  state: TableState;
  /** You are already at this table: hosting it, or sat at it earlier. */
  mine: boolean;
  hostName: string;
  openedAt: Date;
  /** How many people have ever joined. */
  seatsTaken: number;
  seatsFree: number;
  /** Last sign of life — a join, a status change, a deal. */
  updatedAt: Date;
  players: Array<{ userId: string; name: string; avatar: string | null; image: string | null }>;
}

const nameOf = (user: { username: string | null; name: string | null } | null) =>
  user?.username ?? user?.name ?? 'player';

/** The shape the query selects, named so the pure mapper can be tested alone. */
export interface RoomRow {
  id: string;
  code: string;
  name: string;
  gameId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  hostId: string;
  host: { username: string | null; name: string | null } | null;
  players: Array<{
    id: string;
    username: string | null;
    name: string | null;
    avatar: string | null;
    image: string | null;
  }>;
}

/**
 * Which of the join route's three answers this room would give.
 *
 * Deliberately in the same order as the checks in /api/rooms/join: a started
 * match refuses first, then a full table. A row that disagreed with that order
 * would promise something the server then takes away.
 */
export function tableState(
  room: { status: string; updatedAt: Date },
  seatsFree: number,
  now: Date,
): TableState {
  if (now.getTime() - room.updatedAt.getTime() >= FRESH_FOR_MS) return 'stale';
  if (room.status === 'PLAYING') return 'playing';
  if (seatsFree <= 0) return 'full';
  return 'open';
}

/** One room row as the table lists see it, from one player's point of view. */
export function toOpenTable(room: RoomRow, userId: string, now: Date): OpenTable {
  const game = gameForRoom(room.gameId);
  const seatsTaken = room.players.length;
  const seatsFree = Math.max(0, game.maxPlayers - seatsTaken);
  const mine = room.hostId === userId || room.players.some((player) => player.id === userId);

  return {
    id: room.id,
    // Yours prints its code, because you are already inside and the room page
    // shows it anyway. Anybody else's keeps it.
    code: mine ? room.code : null,
    name: room.name,
    game,
    hostId: room.hostId,
    state: tableState(room, seatsFree, now),
    mine,
    hostName: nameOf(room.host),
    openedAt: room.createdAt,
    updatedAt: room.updatedAt,
    seatsTaken,
    seatsFree,
    players: room.players.map((player) => ({
      userId: player.id,
      name: nameOf(player),
      avatar: player.avatar,
      image: player.image,
    })),
  };
}

export interface Tables {
  /** Hosted by you, or sat at by you — and, once it has gone quiet, hosted by you. */
  mine: OpenTable[];
  /** Everybody else's that are still going. Listed without their codes. */
  global: OpenTable[];
}

/**
 * Yours and everybody else's, keeping the order they arrived in.
 *
 * A table that has gone quiet stays on its host's list and drops off everyone
 * else's, seated players included: the host is the one who can reopen it or
 * delete it, and to anyone else it is only a row they cannot act on. It comes
 * back for everybody the moment it is touched again, because staleness is
 * worked out from the room's last write every time the list is read — there is
 * nothing to switch back on.
 */
export function splitTables(tables: OpenTable[], userId: string): Tables {
  const going = (table: OpenTable) => table.state !== 'stale';
  return {
    mine: tables.filter((table) => table.mine && (going(table) || table.hostId === userId)),
    global: tables.filter((table) => !table.mine && going(table)),
  };
}
