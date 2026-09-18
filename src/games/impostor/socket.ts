import type { Server, Socket } from 'socket.io';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  addPlayer,
  castVote,
  createGame,
  pickSteal,
  submitAnswer,
  tapSuspicion,
  tick,
  viewFor,
} from './engine';
import { isImpostorReaction } from './reactions';
import type { ImpostorState, Mode } from './types';

/**
 * The live half of Impostor.
 *
 * Every event is prefixed `imp:`, the same way Teen Ki Tigdi's are `tigdi:` and
 * Doodle Dhamaka's are `doodle:`, so the games can share one connection without
 * answering each other.
 *
 * Unlike Doodle Dhamaka there is no second channel here: nothing in this game
 * is public enough to broadcast raw. Every payload is a view built for one
 * player, because the difference between two players' screens *is* the game.
 */

const TICK_MS = 400;
const MAX_FRIEND_QUESTIONS = 5;
const REACT_GAP_MS = 400;
/**
 * The least time between two taps of the same toggle by one player.
 *
 * Suspicion and — under Khulla Vote — voting can both be changed as often as
 * you like, and each change rebuilds and sends a view to every socket at the
 * table. Without a floor, one page holding a toggle down fans that out to
 * everybody dozens of times a second. Short enough that nobody playing
 * normally will ever meet it.
 */
const TAP_GAP_MS = 250;
const MODES: Mode[] = ['classic', 'friends', 'chaos', 'quick'];

interface ImpostorRoomPlayer {
  id: string;
  name: string;
  avatar?: string | null;
  title?: string | null;
  socketIds: Set<string>;
}

interface ImpostorRoom {
  roomCode: string;
  players: ImpostorRoomPlayer[];
  state?: ImpostorState;
  questions: Array<{ playerId: string; text: string }>;
  mode: Mode;
  hostId?: string | null;
  hostLookup?: Promise<string | null>;
  persistedStatus?: 'LOBBY' | 'PLAYING';
  timer?: NodeJS.Timeout;
  /** The last thing the clients were told, so the clock only speaks on change. */
  lastMark?: string;
  lastReactAt: Map<string, number>;
  lastTapAt: Map<string, number>;
  lastVoteAt: Map<string, number>;
  /** When each player's last socket went away, for the refresh grace. */
  lastSeenAt: Map<string, number>;
}

const rooms = new Map<string, ImpostorRoom>();

/**
 * The fewest people a game can start with.
 *
 * Three in production, always. In development it can be lowered to two with
 * `IMPOSTOR_MIN_PLAYERS`, which is the only way one person can look at both
 * sides of a secret — two browser windows, one of which is the impostor.
 *
 * Two is not a game: neither player can vote for themselves, so the vote is
 * always one-all, the impostor is always caught on the tie, and the round
 * always ends in a steal-back. That makes it a poor way to judge whether the
 * game is fun and a very good way to reach the steal-back on demand, which is
 * what it is for.
 *
 * Read on every call rather than once at import, because the socket server is
 * loaded before Next.js has read `.env.local`.
 */
export function minPlayers(): number {
  if (process.env.NODE_ENV === 'production') return MIN_PLAYERS;
  const wanted = Number(process.env.IMPOSTOR_MIN_PLAYERS);
  return Number.isInteger(wanted) && wanted >= 2 && wanted < MIN_PLAYERS ? wanted : MIN_PLAYERS;
}

function makeRoom(roomCode: string): ImpostorRoom {
  return {
    roomCode,
    players: [],
    questions: [],
    mode: 'classic',
    lastReactAt: new Map(),
    lastTapAt: new Map(),
    lastVoteAt: new Map(),
    lastSeenAt: new Map(),
  };
}

export function closeImpostorRoom(code: string) {
  const room = rooms.get(code);
  if (!room) return;
  if (room.timer) clearInterval(room.timer);
  rooms.delete(code);
}

// ── Who is here, and who runs the table ─────────────────────────────────────

const online = (room: ImpostorRoom) => room.players.filter((player) => player.socketIds.size > 0);

/**
 * How long a player who has just vanished still counts as being at the table.
 *
 * A round begins on a clock tick, and a page refresh empties that player's
 * sockets for a second or two. Without this grace they are simply missing from
 * the next round's order — no question, no answer, no vote — for having
 * reloaded at the wrong moment during the score screen.
 */
const GRACE_MS = 20_000;

/**
 * Who is dealt into the next round: everyone here, plus anyone who dropped off
 * a moment ago and is almost certainly coming straight back.
 */
function activeIds(room: ImpostorRoom): Set<string> {
  const now = Date.now();
  return new Set(
    room.players
      .filter(
        (player) =>
          player.socketIds.size > 0 || now - (room.lastSeenAt.get(player.id) ?? 0) < GRACE_MS,
      )
      .map((player) => player.id),
  );
}

function ensureHostId(io: Server, room: ImpostorRoom): Promise<string | null> {
  room.hostLookup ??= import('@/lib/prisma')
    .then(({ prisma }) => prisma.room.findUnique({ where: { code: room.roomCode }, select: { hostId: true } }))
    .then((row) => {
      room.hostId = row?.hostId ?? null;
      void emitAll(io, room);
      return room.hostId;
    })
    .catch(() => {
      room.hostLookup = undefined;
      return null;
    });
  return room.hostLookup;
}

/** The host while they are here; otherwise whoever has been here longest. */
function adminOf(room: ImpostorRoom) {
  const present = online(room);
  return present.find((player) => player.id === room.hostId) ?? present[0];
}

async function adminDenial(io: Server, room: ImpostorRoom, socket: Socket) {
  const playerId = socket.data.playerId as string | undefined;
  if (socket.data.roomCode !== room.roomCode || !playerId) return 'Join this room first.';
  await ensureHostId(io, room);
  const admin = adminOf(room);
  if (!admin) return 'Nobody is at this table.';
  if (admin.id !== playerId) return `Only ${admin.name} can run this table.`;
  return undefined;
}

// ── Telling people ──────────────────────────────────────────────────────────

/**
 * The lobby, as one player sees it.
 *
 * Everyone's question *count*, only your own questions. A question you can read
 * before the game is a question you recognise the moment it is asked — which
 * would tell you, immediately, that you are not the impostor.
 */
function roomPayload(room: ImpostorRoom, viewerId: string | null) {
  const admin = adminOf(room);
  return {
    minPlayers: minPlayers(),
    maxPlayers: MAX_PLAYERS,
    mode: room.mode,
    started: room.state !== undefined,
    admin: admin ? { id: admin.id, name: admin.name, isHost: admin.id === room.hostId } : null,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar ?? null,
      title: player.title ?? null,
      isOnline: player.socketIds.size > 0,
      questions: room.questions.filter((entry) => entry.playerId === player.id).length,
    })),
    yourQuestions: room.questions.filter((entry) => entry.playerId === viewerId).map((entry) => entry.text),
  };
}

function syncRoomStatus(room: ImpostorRoom) {
  const live = room.state !== undefined && room.state.phase !== 'GAME_OVER';
  const status = live && online(room).length > 0 ? 'PLAYING' : 'LOBBY';
  if (room.persistedStatus === status) return;
  room.persistedStatus = status;
  void import('@/lib/prisma')
    .then(({ prisma }) => prisma.room.update({ where: { code: room.roomCode }, data: { status } }))
    .catch(() => {
      if (room.persistedStatus === status) room.persistedStatus = undefined;
    });
}

/** Sends every socket in the room its own lobby and its own view of the game. */
async function emitAll(io: Server, room: ImpostorRoom) {
  syncRoomStatus(room);
  const now = Date.now();
  const sockets = await io.in(room.roomCode).fetchSockets();
  for (const peer of sockets) {
    const viewerId = (peer.data.playerId as string | undefined) ?? null;
    const seated = viewerId !== null && room.players.some((player) => player.id === viewerId);
    peer.emit('imp:room', roomPayload(room, seated ? viewerId : null));
    peer.emit('imp:state', room.state ? viewFor(room.state, seated ? viewerId : null, now) : null);
  }
}

/**
 * What the clients were last told.
 *
 * The clock runs constantly; a view is only worth sending when something has
 * actually moved. Every field here is something a page would draw differently.
 */
function markOf(state: ImpostorState) {
  const round = state.round;
  return [
    state.phase,
    round.number,
    round.turn,
    round.answers.length,
    Object.keys(round.votes).length,
    Object.keys(round.suspicion).length,
    Object.keys(round.stealPicks).length,
    round.defenceTurn,
    round.endsAt,
  ].join('|');
}

// ── The clock ───────────────────────────────────────────────────────────────

function stopClock(room: ImpostorRoom) {
  if (room.timer) clearInterval(room.timer);
  room.timer = undefined;
}

function startClock(io: Server, room: ImpostorRoom) {
  stopClock(room);
  room.timer = setInterval(() => {
    const state = room.state;
    if (!state) return stopClock(room);
    // With nobody connected nothing moves: a table that drops off together
    // comes back to the round they left, not to a game that ran out without
    // them.
    if (online(room).length === 0) return;

    const changed = tick(state, Date.now(), Math.random, activeIds(room));
    const mark = markOf(state);
    if (!changed && mark === room.lastMark) return;
    room.lastMark = mark;
    void emitAll(io, room);

    if (state.phase === 'GAME_OVER') {
      stopClock(room);
      void recordGame(room, state);
    }
  }, TICK_MS);
}

/**
 * Keeps the finished game, the same way Doodle Dhamaka does. No XP or stats
 * read it yet, but the result is on record from the first game played so
 * whatever progression Impostor gets later has a history to start from.
 */
async function recordGame(room: ImpostorRoom, state: ImpostorState) {
  if (!state.final) return;
  try {
    const { prisma } = await import('@/lib/prisma');
    const row = await prisma.room.findUnique({ where: { code: room.roomCode }, select: { id: true, hostId: true } });
    if (!row) return;
    const top = state.final.standings[0]?.score ?? 0;
    await prisma.match.create({
      data: {
        gameId: 'IMPOSTOR',
        roomId: row.id,
        hostId: row.hostId,
        status: 'FINISHED',
        finishedAt: new Date(),
        hadBots: false,
        // Round-tripped through JSON so it is plain data, which is all a JSON
        // column can hold and all Prisma's input type will accept.
        detail: JSON.parse(
          JSON.stringify({
            mode: state.mode,
            rounds: state.history.length,
            standings: state.final.standings,
            awards: state.final.awards,
            questions: state.history.map((result) => ({
              question: result.question.text,
              chaal: result.chaal,
              impostorIds: result.impostorIds,
              caughtIds: result.caughtIds,
              stoleIds: result.stoleIds,
            })),
          }),
        ),
        seats: {
          create: state.final.standings.map((standing, seat) => ({
            userId: standing.playerId,
            seat,
            team: 'SOLO',
            won: top > 0 && standing.score === top,
          })),
        },
        players: { connect: state.final.standings.map((standing) => ({ id: standing.playerId })) },
      },
    });
  } catch (error) {
    console.error(`Could not record the Impostor game in room ${room.roomCode}:`, error);
  }
}

// ── Wiring ──────────────────────────────────────────────────────────────────

type Reply = (result: { error?: string; [key: string]: unknown }) => void;

/**
 * True when this player has just used this control.
 *
 * Kept per control rather than one bucket for all of them: sharing a bucket
 * means tapping suspicion and then voting swallows the vote, which is the one
 * action in this game that must never go missing quietly.
 */
function tooFast(bucket: Map<string, number>, playerId: string): boolean {
  const now = Date.now();
  if (now - (bucket.get(playerId) ?? 0) < TAP_GAP_MS) return true;
  bucket.set(playerId, now);
  return false;
}

export function registerImpostorHandlers(io: Server) {
  io.on('connection', (socket) => {
    const playerOf = (room: ImpostorRoom) => {
      const id = socket.data.playerId as string | undefined;
      return socket.data.roomCode === room.roomCode ? room.players.find((player) => player.id === id) : undefined;
    };

    /** The shared preamble for every in-game action. */
    const acting = (roomCode: string) => {
      const room = rooms.get(roomCode);
      const player = room && playerOf(room);
      if (!room?.state || !player) return null;
      return { room, player, state: room.state };
    };

    socket.on('imp:watch', ({ roomCode }: { roomCode: string }) => {
      socket.join(roomCode);
      const room = rooms.get(roomCode);
      if (!room) return;
      socket.emit('imp:room', roomPayload(room, null));
      socket.emit('imp:state', room.state ? viewFor(room.state, null, Date.now()) : null);
    });

    socket.on(
      'imp:join',
      ({ roomCode, playerId, playerName, playerAvatar, playerTitle }: {
        roomCode: string; playerId: string; playerName: string; playerAvatar?: string | null; playerTitle?: string | null;
      }) => {
        if (typeof roomCode !== 'string' || typeof playerId !== 'string') return;
        const room = rooms.get(roomCode) ?? makeRoom(roomCode);
        rooms.set(roomCode, room);

        let player = room.players.find((entry) => entry.id === playerId);
        if (!player) {
          if (room.players.length >= MAX_PLAYERS) {
            socket.emit('imp:error', 'This table is full.');
            return;
          }
          player = { id: playerId, name: String(playerName).slice(0, 24), socketIds: new Set() };
          room.players.push(player);
        }
        player.avatar = playerAvatar ?? null;
        player.title = playerTitle ?? null;
        // A friend arriving mid-game is in from the next round; this one has
        // its order and its impostor already.
        if (room.state && room.state.phase !== 'GAME_OVER') addPlayer(room.state, { id: player.id, name: player.name });

        void ensureHostId(io, room);
        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.playerId = playerId;
        socket.data.name = player.name;
        player.socketIds.add(socket.id);
        socket.emit('imp:joined', playerId);
        void emitAll(io, room);
      },
    );

    socket.on('imp:add-question', ({ roomCode, text }: { roomCode: string; text: string }, reply?: Reply) => {
      const room = rooms.get(roomCode);
      const player = room && playerOf(room);
      if (!room || !player) return reply?.({ error: 'Join this room first.' });
      if (room.state) return reply?.({ error: 'Questions are added before the game starts.' });

      const question = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
      if (question.length < 8 || question.length > 120) {
        return reply?.({ error: 'A question, 8 to 120 characters.' });
      }
      const mine = room.questions.filter((entry) => entry.playerId === player.id);
      if (mine.length >= MAX_FRIEND_QUESTIONS) return reply?.({ error: `Up to ${MAX_FRIEND_QUESTIONS} each.` });
      if (room.questions.some((entry) => entry.text.toLowerCase() === question.toLowerCase())) {
        return reply?.({ error: 'Someone already added that one.' });
      }
      room.questions.push({ playerId: player.id, text: question });
      void emitAll(io, room);
      reply?.({});
    });

    socket.on('imp:remove-question', ({ roomCode, text }: { roomCode: string; text: string }, reply?: Reply) => {
      const room = rooms.get(roomCode);
      const player = room && playerOf(room);
      if (!room || !player) return reply?.({ error: 'Join this room first.' });
      if (room.state) return reply?.({ error: 'The game has started.' });
      room.questions = room.questions.filter((entry) => !(entry.playerId === player.id && entry.text === text));
      void emitAll(io, room);
      reply?.({});
    });

    socket.on('imp:mode', async ({ roomCode, mode }: { roomCode: string; mode: Mode }, reply?: Reply) => {
      const room = rooms.get(roomCode);
      if (!room) return reply?.({ error: 'Room not found.' });
      const denial = await adminDenial(io, room, socket);
      if (denial) return reply?.({ error: denial });
      if (!MODES.includes(mode)) return reply?.({ error: 'No such mode.' });
      room.mode = mode;
      void emitAll(io, room);
      reply?.({});
    });

    socket.on('imp:start', async ({ roomCode }: { roomCode: string }, reply?: Reply) => {
      const room = rooms.get(roomCode);
      if (!room) return reply?.({ error: 'Room not found.' });
      const denial = await adminDenial(io, room, socket);
      if (denial) return reply?.({ error: denial });
      // Read after the await: a second click must not start a second game.
      if (room.state) return reply?.({ error: 'A game is already running.' });
      const here = online(room);
      if (here.length < minPlayers()) {
        return reply?.({ error: `Impostor needs at least ${minPlayers()} people here.` });
      }

      room.state = createGame({
        roomCode,
        players: here.map((player) => ({ id: player.id, name: player.name })),
        mode: room.mode,
        // Friends mode is the only one that mixes the table's own questions in;
        // the others play the written bank.
        friendQuestions: room.mode === 'friends' ? room.questions.map((entry) => entry.text) : [],
        now: Date.now(),
      });
      room.lastMark = undefined;
      void emitAll(io, room);
      startClock(io, room);
      reply?.({});
    });

    /** Back to the lobby — after a finished game, or to abandon one. */
    socket.on('imp:reset', async ({ roomCode }: { roomCode: string }, reply?: Reply) => {
      const room = rooms.get(roomCode);
      if (!room) return reply?.({ error: 'Room not found.' });
      const denial = await adminDenial(io, room, socket);
      if (denial) return reply?.({ error: denial });
      stopClock(room);
      room.state = undefined;
      room.lastMark = undefined;
      // Seats are only kept through a game so somebody can come back to it.
      // Back in the lobby that reason is gone, and a ghost would hold a seat at
      // the twelve-player cap for as long as the room existed.
      room.players = room.players.filter((player) => player.socketIds.size > 0);
      void emitAll(io, room);
      reply?.({});
    });

    socket.on('imp:answer', ({ roomCode, text }: { roomCode: string; text: string }, reply?: Reply) => {
      const context = acting(roomCode);
      if (!context) return reply?.({ error: 'No game in progress.' });
      const result = submitAnswer(context.state, context.player.id, typeof text === 'string' ? text : '', Date.now());
      if (!result.ok) return reply?.({ error: result.reason });
      void emitAll(io, context.room);
      reply?.({});
    });

    socket.on('imp:suspect', ({ roomCode, targetId }: { roomCode: string; targetId: string | null }, reply?: Reply) => {
      const context = acting(roomCode);
      if (!context) return reply?.({ error: 'No game in progress.' });
      if (tooFast(context.room.lastTapAt, context.player.id)) return reply?.({});
      const result = tapSuspicion(context.state, context.player.id, targetId ?? null);
      if (!result.ok) return reply?.({ error: result.reason });
      void emitAll(io, context.room);
      reply?.({});
    });

    socket.on('imp:vote', ({ roomCode, targetId }: { roomCode: string; targetId: string | null }, reply?: Reply) => {
      const context = acting(roomCode);
      if (!context) return reply?.({ error: 'No game in progress.' });
      // A swallowed vote is told about, rather than looking like it landed.
      if (tooFast(context.room.lastVoteAt, context.player.id)) {
        return reply?.({ error: 'One at a time 😅' });
      }
      const result = castVote(context.state, context.player.id, targetId ?? null, Date.now());
      if (!result.ok) return reply?.({ error: result.reason });
      void emitAll(io, context.room);
      reply?.({});
    });

    socket.on('imp:steal', ({ roomCode, questionId }: { roomCode: string; questionId: string }, reply?: Reply) => {
      const context = acting(roomCode);
      if (!context) return reply?.({ error: 'No game in progress.' });
      const result = pickSteal(context.state, context.player.id, String(questionId), Date.now());
      if (!result.ok) return reply?.({ error: result.reason });
      void emitAll(io, context.room);
      reply?.({});
    });

    socket.on('imp:react', ({ roomCode, emoji }: { roomCode: string; emoji: string }) => {
      const room = rooms.get(roomCode);
      const player = room && playerOf(room);
      if (!room || !player || !isImpostorReaction(emoji)) return;
      const now = Date.now();
      if (now - (room.lastReactAt.get(player.id) ?? 0) < REACT_GAP_MS) return;
      room.lastReactAt.set(player.id, now);
      io.to(roomCode).emit('imp:reacted', { playerId: player.id, emoji });
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      const player = room?.players.find((entry) => entry.id === playerId);
      if (!room || !player) return;
      player.socketIds.delete(socket.id);
      if (player.socketIds.size === 0) room.lastSeenAt.set(player.id, Date.now());
      // Nobody has joined a game that never started, so an empty seat in the
      // lobby is simply gone; mid-game it is kept for when they come back.
      if (!room.state && player.socketIds.size === 0) {
        room.players = room.players.filter((entry) => entry.id !== playerId);
      }
      void emitAll(io, room);
    });
  });
}
