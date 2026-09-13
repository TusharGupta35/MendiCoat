import type { Server, Socket } from 'socket.io';
import {
  MIN_BID,
  PARTNER_CALLS,
  applyBid,
  applyContract,
  applyPlay,
  createInitialTigdiState,
  isSupportedCount,
  minimumBid,
  validateBid,
  validateContract,
  validatePlay,
  viewFor,
} from '@/games/teen-ki-tigdi/engine';
import type { TigdiPlayerCount } from '@/games/teen-ki-tigdi/engine';
import { chooseTigdiBid, chooseTigdiCard, chooseTigdiContract } from '@/games/teen-ki-tigdi/bot';
import type { Card, Suit, TigdiResult, TigdiSeat, TigdiState } from '@/games/teen-ki-tigdi/types';

/**
 * The live half of Teen Ki Tigdi.
 *
 * Kept in its own module rather than folded into the Mendi Coat server, and
 * every event it listens for is prefixed `tigdi:`. Two games share one socket
 * connection and one room code space; the prefix is what keeps a Tigdi table
 * from answering a Mendi Coat client, and the other way round.
 *
 * The rule this file exists to enforce: **nobody is ever sent the whole state.**
 * The server holds it, and each socket is handed `viewFor(state, theirSeat)`.
 * Hidden partners are the game, and a secret that reaches the browser is not a
 * secret — the Mendi Coat server broadcasts every hand to the whole room, which
 * is harmless there and would be fatal here.
 */

const DEFAULT_SEATS: TigdiPlayerCount = 7;

/** How long a finished trick sits on the table before it is swept. */
const TRICK_HOLD_MS = 1800;
const BOT_TURN_MS = 750;
/** A hand nobody bid on is shown, then re-dealt on its own. */
const PASSED_OUT_MS = 3200;

interface TigdiRoomPlayer {
  id: string;
  name: string;
  avatar?: string | null;
  title?: string | null;
  isBot: boolean;
  socketIds: Set<string>;
}

/** One finished hand, kept so the table can read back how the night has gone. */
export interface TigdiHandRecord extends TigdiResult {
  /** Seat → team, as it stood at the end, when everything is public anyway. */
  teams: Array<'BIDDER' | 'OPPONENT'>;
  names: string[];
}

interface TigdiRoom {
  roomCode: string;
  seatCount: TigdiPlayerCount;
  players: Array<TigdiRoomPlayer | undefined>;
  state?: TigdiState;
  history: TigdiHandRecord[];
  /** A running tally: a point per seat for each hand their side took. */
  scores: number[];
  /** Who opens the bidding, moved on one seat per hand. */
  firstBidder: TigdiSeat;
  hostId?: string | null;
  hostLookup?: Promise<string | null>;
  persistedStatus?: 'LOBBY' | 'PLAYING';
  /** Cancels the pending bot turn when a hand is torn down under it. */
  botTimer?: NodeJS.Timeout;
}

const rooms = new Map<string, TigdiRoom>();

function makeRoom(roomCode: string): TigdiRoom {
  return {
    roomCode,
    seatCount: DEFAULT_SEATS,
    players: Array.from({ length: DEFAULT_SEATS }),
    history: [],
    scores: Array.from({ length: DEFAULT_SEATS }, () => 0),
    firstBidder: 0,
  };
}

/** Forgets a room outright. Only the host deleting it gets here. */
export function closeTigdiRoom(code: string) {
  const room = rooms.get(code);
  if (!room) return;
  if (room.botTimer) clearTimeout(room.botTimer);
  rooms.delete(code);
}

// ── Who may run the table ───────────────────────────────────────────────────

function ensureHostId(io: Server, room: TigdiRoom): Promise<string | null> {
  room.hostLookup ??= import('@/lib/prisma')
    .then(({ prisma }) =>
      prisma.room.findUnique({ where: { code: room.roomCode }, select: { hostId: true } }),
    )
    .then((row) => {
      room.hostId = row?.hostId ?? null;
      void emitState(io, room);
      return room.hostId;
    })
    .catch(() => {
      room.hostLookup = undefined;
      return null;
    });
  return room.hostLookup;
}

/**
 * The host while they are here; otherwise the connected human in the lowest
 * seat, so a table the host walked away from can still deal the next hand.
 */
function adminOf(room: TigdiRoom): TigdiRoomPlayer | undefined {
  const present = room.players.filter(
    (player): player is TigdiRoomPlayer => !!player && !player.isBot && player.socketIds.size > 0,
  );
  return present.find((player) => player.id === room.hostId) ?? present[0];
}

async function adminDenial(io: Server, room: TigdiRoom, socket: Socket) {
  const playerId = socket.data.playerId as string | undefined;
  if (socket.data.roomCode !== room.roomCode || !playerId) return 'Take a seat in this room first.';
  await ensureHostId(io, room);
  const admin = adminOf(room);
  if (!admin) return 'Nobody is at this table.';
  if (admin.id !== playerId) return `Only ${admin.name} can run this table.`;
  return undefined;
}

// ── Emitting ────────────────────────────────────────────────────────────────

function roomPayload(room: TigdiRoom) {
  const admin = adminOf(room);
  return {
    seatCount: room.seatCount,
    calls: PARTNER_CALLS[room.seatCount],
    minBid: MIN_BID,
    scores: room.scores,
    history: room.history,
    admin: admin ? { id: admin.id, name: admin.name, isHost: admin.id === room.hostId } : null,
    players: room.players.map((player, seat) =>
      player
        ? {
            id: player.id,
            name: player.name,
            avatar: player.avatar ?? null,
            title: player.title ?? null,
            isBot: player.isBot,
            isOnline: player.isBot || player.socketIds.size > 0,
            seat,
          }
        : null,
    ),
  };
}

function syncRoomStatus(room: TigdiRoom) {
  const live = room.state !== undefined && room.state.phase !== 'FINISHED';
  const anyoneHere = room.players.some((p) => p && !p.isBot && p.socketIds.size > 0);
  const status = live && anyoneHere ? 'PLAYING' : 'LOBBY';
  if (room.persistedStatus === status) return;
  room.persistedStatus = status;
  void import('@/lib/prisma')
    .then(({ prisma }) => prisma.room.update({ where: { code: room.roomCode }, data: { status } }))
    .catch(() => {
      if (room.persistedStatus === status) room.persistedStatus = undefined;
    });
}

/** The seat a given socket is sitting in, or null if it is only watching. */
function seatOfSocket(room: TigdiRoom, socket: { data: Record<string, unknown> }): TigdiSeat | null {
  const playerId = socket.data.playerId as string | undefined;
  if (!playerId) return null;
  const seat = room.players.findIndex((player) => player?.id === playerId);
  return seat >= 0 ? seat : null;
}

/**
 * Sends every socket in the room the state *it* is allowed to see.
 *
 * One redaction per socket rather than one broadcast, which is the price of the
 * game having secrets at all. Tables are seven people at most, so it is a cheap
 * price.
 */
async function emitState(io: Server, room: TigdiRoom) {
  syncRoomStatus(room);
  io.to(room.roomCode).emit('tigdi:room', roomPayload(room));
  if (!room.state) {
    io.to(room.roomCode).emit('tigdi:state', null);
    return;
  }
  const sockets = await io.in(room.roomCode).fetchSockets();
  for (const peer of sockets) {
    peer.emit('tigdi:state', viewFor(room.state, seatOfSocket(room, peer)));
  }
}

// ── Dealing and driving ─────────────────────────────────────────────────────

function dealHand(io: Server, room: TigdiRoom) {
  if (room.botTimer) clearTimeout(room.botTimer);
  room.state = createInitialTigdiState(
    room.roomCode,
    room.players.map((player, seat) => player?.name ?? `Seat ${seat + 1}`),
    { firstBidder: room.firstBidder },
  );
  void emitState(io, room);
  scheduleBot(io, room);
}

function recordHand(room: TigdiRoom, state: TigdiState) {
  const result = state.result!;
  const teams = state.players.map((player) => player.team ?? 'OPPONENT');
  room.history.push({
    ...result,
    teams,
    names: state.players.map((player) => player.name),
  });
  // A point apiece to whichever side took the hand. Deliberately the simplest
  // scoreboard that means anything — the bid itself is the drama, and a
  // Kaali Teeri-style ladder can come once the table has played a few nights.
  state.players.forEach((player, seat) => {
    if (player.team === result.winners) room.scores[seat] += 1;
  });
}

const isBotSeat = (room: TigdiRoom, seat: TigdiSeat) => room.players[seat]?.isBot === true;

/**
 * Moves the hand on when the seat to act is a bot.
 *
 * One timer per room, always replaced rather than stacked, so a hand that is
 * torn down mid-thought never has a stray bot move land in the next one.
 */
function scheduleBot(io: Server, room: TigdiRoom, delayMs = BOT_TURN_MS) {
  if (room.botTimer) clearTimeout(room.botTimer);
  const state = room.state;
  if (!state) return;

  if (state.phase === 'PASSED_OUT') {
    room.botTimer = setTimeout(() => {
      // Nobody wanted the hand. Move the deal on and try again.
      if (room.state?.phase !== 'PASSED_OUT') return;
      room.firstBidder = (room.firstBidder + 1) % room.seatCount;
      dealHand(io, room);
    }, PASSED_OUT_MS);
    return;
  }
  if (state.phase === 'FINISHED') return;
  if (!isBotSeat(room, state.currentTurn)) return;

  room.botTimer = setTimeout(() => {
    const current = room.state;
    if (!current || current === undefined) return;
    const seat = current.currentTurn;
    if (!isBotSeat(room, seat)) return;
    const view = viewFor(current, seat);

    let next: TigdiState | undefined;
    let held = false;
    if (current.phase === 'BIDDING') {
      const amount = chooseTigdiBid(view, minimumBid(current));
      if (validateBid(current, seat, amount).valid) next = applyBid(current, seat, amount);
    } else if (current.phase === 'CALLING') {
      const { trumpSuit, calledCards } = chooseTigdiContract(view);
      if (validateContract(current, seat, trumpSuit, calledCards).valid) {
        next = applyContract(current, seat, trumpSuit, calledCards);
      }
    } else if (current.phase === 'PLAYING') {
      const card = chooseTigdiCard(view);
      if (card && validatePlay(current, seat, card).valid) {
        // The last card of a trick stays up long enough to be read.
        held = current.trickCards.length === current.playerCount - 1;
        next = applyPlay(current, seat, card);
      }
    }
    if (!next) return;

    room.state = next;
    if (next.phase === 'FINISHED') recordHand(room, next);
    void emitState(io, room);
    scheduleBot(io, room, held ? TRICK_HOLD_MS : BOT_TURN_MS);
  }, delayMs);
}

/** Applies a human move and hands the turn on. Shared by all three move events. */
function commit(io: Server, room: TigdiRoom, next: TigdiState, held: boolean) {
  room.state = next;
  if (next.phase === 'FINISHED') recordHand(room, next);
  void emitState(io, room);
  scheduleBot(io, room, held ? TRICK_HOLD_MS : BOT_TURN_MS);
}

// ── Wiring ──────────────────────────────────────────────────────────────────

export function registerTigdiHandlers(io: Server) {
  // Anything the database still calls PLAYING at boot is a leftover: no Tigdi
  // room is live in this process yet. Mendi Coat's server does the same sweep
  // over the same table, and both are idempotent.
  io.on('connection', (socket) => {
    const roomOf = (roomCode: string) => rooms.get(roomCode);

    socket.on('tigdi:watch', async ({ roomCode }: { roomCode: string }) => {
      socket.join(roomCode);
      const room = roomOf(roomCode);
      if (!room) return;
      void ensureHostId(io, room);
      socket.emit('tigdi:room', roomPayload(room));
      socket.emit(
        'tigdi:state',
        room.state ? viewFor(room.state, seatOfSocket(room, socket)) : null,
      );
    });

    socket.on(
      'tigdi:join',
      async ({
        roomCode,
        playerId,
        playerName,
        playerAvatar,
        playerTitle,
      }: {
        roomCode: string;
        playerId: string;
        playerName: string;
        playerAvatar?: string | null;
        playerTitle?: string | null;
      }) => {
        const room = rooms.get(roomCode) ?? makeRoom(roomCode);
        rooms.set(roomCode, room);

        let seat = room.players.findIndex((player) => player?.id === playerId);
        if (seat === -1) {
          if (room.state) {
            socket.emit('tigdi:error', 'This hand is already under way.');
            return;
          }
          seat = room.players.findIndex((player) => !player);
          if (seat === -1) {
            socket.emit('tigdi:error', 'This table is full.');
            return;
          }
          room.players[seat] = {
            id: playerId,
            name: playerName,
            avatar: playerAvatar ?? null,
            title: playerTitle ?? null,
            isBot: false,
            socketIds: new Set(),
          };
        } else if (room.players[seat]) {
          // A returning player may have changed their avatar or title.
          room.players[seat]!.avatar = playerAvatar ?? null;
          room.players[seat]!.title = playerTitle ?? null;
        }

        void ensureHostId(io, room);
        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.playerId = playerId;
        socket.data.name = playerName;
        room.players[seat]!.socketIds.add(socket.id);
        socket.emit('tigdi:seat', seat);
        void emitState(io, room);
      },
    );

    /**
     * How many seats this table plays with. Only in the lobby, and never fewer
     * than the people already sitting down.
     */
    socket.on(
      'tigdi:set-seats',
      async (
        { roomCode, count }: { roomCode: string; count: number },
        callback?: (result: { error?: string }) => void,
      ) => {
        const room = roomOf(roomCode);
        if (!room) return callback?.({ error: 'Room not found.' });
        const denial = await adminDenial(io, room, socket);
        if (denial) return callback?.({ error: denial });
        // Read after the await: the host check can wait on the database, and a
        // second click inside that window must not act on the older state.
        if (room.state) return callback?.({ error: 'Finish this hand first.' });
        if (!isSupportedCount(count)) {
          return callback?.({ error: 'Teen Ki Tigdi is played by 5, 6 or 7.' });
        }

        const seated = room.players.filter(Boolean).length;
        const occupiedBeyond = room.players.slice(count).some(Boolean);
        if (occupiedBeyond) {
          return callback?.({
            error: `There are ${seated} people at this table. Ask someone to leave before shrinking it.`,
          });
        }

        room.seatCount = count;
        room.players = Array.from({ length: count }, (_, seat) => room.players[seat]);
        room.scores = Array.from({ length: count }, (_, seat) => room.scores[seat] ?? 0);
        room.firstBidder = room.firstBidder % count;
        void emitState(io, room);
        callback?.({});
      },
    );

    socket.on(
      'tigdi:fill-bots',
      async ({ roomCode }: { roomCode: string }, callback?: (result: { error?: string }) => void) => {
        const room = roomOf(roomCode);
        if (!room) return callback?.({ error: 'Room not found.' });
        const denial = await adminDenial(io, room, socket);
        if (denial) return callback?.({ error: denial });
        if (room.state) return callback?.({ error: 'A hand is already under way.' });

        let botNumber = 1;
        for (let seat = 0; seat < room.seatCount; seat += 1) {
          if (room.players[seat]) continue;
          room.players[seat] = {
            id: `bot-${seat}`,
            name: `Bot ${botNumber}`,
            isBot: true,
            socketIds: new Set(),
          };
          botNumber += 1;
        }
        void emitState(io, room);
        callback?.({});
      },
    );

    socket.on(
      'tigdi:start',
      async ({ roomCode }: { roomCode: string }, callback?: (result: { error?: string }) => void) => {
        const room = roomOf(roomCode);
        if (!room) return callback?.({ error: 'Room not found.' });
        const denial = await adminDenial(io, room, socket);
        if (denial) return callback?.({ error: denial });
        if (room.state) return callback?.({ error: 'A hand is already under way.' });
        if (!room.players.every(Boolean)) {
          return callback?.({ error: `All ${room.seatCount} seats must be filled.` });
        }

        dealHand(io, room);
        callback?.({});
      },
    );

    socket.on(
      'tigdi:next-hand',
      async ({ roomCode }: { roomCode: string }, callback?: (result: { error?: string }) => void) => {
        const room = roomOf(roomCode);
        if (!room) return callback?.({ error: 'Room not found.' });
        const denial = await adminDenial(io, room, socket);
        if (denial) return callback?.({ error: denial });
        if (room.state && room.state.phase !== 'FINISHED') {
          return callback?.({ error: 'Finish this hand first.' });
        }
        if (!room.players.every(Boolean)) {
          return callback?.({ error: `All ${room.seatCount} seats must be filled.` });
        }

        // The deal moves round the table, so the same seat does not open the
        // bidding every hand.
        room.firstBidder = (room.firstBidder + 1) % room.seatCount;
        dealHand(io, room);
        callback?.({});
      },
    );

    socket.on(
      'tigdi:bid',
      ({ roomCode, amount }: { roomCode: string; amount: number | null },
       callback?: (result: { error?: string }) => void) => {
        const room = roomOf(roomCode);
        const state = room?.state;
        if (!room || !state) return callback?.({ error: 'No hand in progress.' });
        const seat = seatOfSocket(room, socket);
        if (seat === null || socket.data.roomCode !== roomCode || isBotSeat(room, seat)) {
          return callback?.({ error: 'You cannot bid for this seat.' });
        }
        const value = amount === null ? null : Number(amount);
        const check = validateBid(state, seat, value);
        if (!check.valid) return callback?.({ error: check.reason });

        commit(io, room, applyBid(state, seat, value), false);
        callback?.({});
      },
    );

    socket.on(
      'tigdi:contract',
      ({ roomCode, trumpSuit, calledCards }: { roomCode: string; trumpSuit: Suit; calledCards: string[] },
       callback?: (result: { error?: string }) => void) => {
        const room = roomOf(roomCode);
        const state = room?.state;
        if (!room || !state) return callback?.({ error: 'No hand in progress.' });
        const seat = seatOfSocket(room, socket);
        if (seat === null || socket.data.roomCode !== roomCode || isBotSeat(room, seat)) {
          return callback?.({ error: 'You cannot name the contract.' });
        }
        const codes = Array.isArray(calledCards) ? calledCards.map(String) : [];
        const check = validateContract(state, seat, trumpSuit, codes);
        if (!check.valid) return callback?.({ error: check.reason });

        commit(io, room, applyContract(state, seat, trumpSuit, codes), false);
        callback?.({});
      },
    );

    socket.on(
      'tigdi:play',
      ({ roomCode, card }: { roomCode: string; card: Card }, callback?: (result: { error?: string }) => void) => {
        const room = roomOf(roomCode);
        const state = room?.state;
        if (!room || !state) return callback?.({ error: 'No hand in progress.' });
        const seat = seatOfSocket(room, socket);
        if (seat === null || socket.data.roomCode !== roomCode || isBotSeat(room, seat)) {
          return callback?.({ error: 'You cannot play for this seat.' });
        }
        const check = validatePlay(state, seat, card);
        if (!check.valid) return callback?.({ error: check.reason });

        const held = state.trickCards.length === state.playerCount - 1;
        commit(io, room, applyPlay(state, seat, card), held);
        callback?.({});
      },
    );

    socket.on(
      'tigdi:thought',
      ({ roomCode, message }: { roomCode: string; message: string }, callback?: (result: { error?: string }) => void) => {
        const room = roomOf(roomCode);
        if (!room) return callback?.({ error: 'Room not found.' });
        const seat = seatOfSocket(room, socket);
        const text = typeof message === 'string' ? message.trim().slice(0, 80) : '';
        if (seat === null || socket.data.roomCode !== roomCode) {
          return callback?.({ error: 'Take a seat before saying something.' });
        }
        if (!text) return callback?.({ error: 'Write something first.' });

        io.to(roomCode).emit('tigdi:said', {
          seat,
          name: room.players[seat]?.name ?? 'Player',
          message: text,
        });
        callback?.({});
      },
    );

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      const player = room?.players.find((entry) => entry?.id === playerId);
      if (!room || !player) return;
      player.socketIds.delete(socket.id);
      void emitState(io, room);
    });
  });
}
