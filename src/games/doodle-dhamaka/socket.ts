import type { Server, Socket } from 'socket.io';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  addPlayer,
  applyDraw,
  choosePrompt,
  createGame,
  hintStage,
  isSuddenDeath,
  submitGuess,
  tick,
  viewFor,
} from './engine';
import { compact } from './match';
import { isDoodleReaction } from './reactions';
import type { DoodleState, DrawOp } from './types';

/**
 * The live half of Doodle Dhamaka.
 *
 * Every event is prefixed `doodle:`, the same way Teen Ki Tigdi's are `tigdi:`,
 * so the three games can share one connection without answering each other.
 *
 * Two kinds of traffic go through here and they are handled differently on
 * purpose. The *game* — phases, guesses, scores — is sent as a view built for
 * each player, because the answer is a secret. The *drawing* is not a secret
 * from anyone, and the drawer sends it many times a second, so drawing actions
 * are relayed as they arrive rather than rebuilt into everyone's view.
 */

const TICK_MS = 400;
const MAX_FRIEND_WORDS = 5;
const GUESS_GAP_MS = 350;
const REACT_GAP_MS = 400;

interface DoodleRoomPlayer {
  id: string;
  name: string;
  avatar?: string | null;
  title?: string | null;
  socketIds: Set<string>;
}

interface DoodleRoom {
  roomCode: string;
  players: DoodleRoomPlayer[];
  state?: DoodleState;
  friendWords: Array<{ playerId: string; text: string }>;
  friendWordsOn: boolean;
  hostId?: string | null;
  hostLookup?: Promise<string | null>;
  persistedStatus?: 'LOBBY' | 'PLAYING';
  timer?: NodeJS.Timeout;
  /** The last moment the clients were told about, so the clock only speaks on change. */
  lastMark?: string;
  lastGuessAt: Map<string, number>;
  lastReactAt: Map<string, number>;
}

const rooms = new Map<string, DoodleRoom>();

/**
 * The fewest people a game can start with.
 *
 * Three, always, in production. In development it can be lowered with
 * `DOODLE_MIN_PLAYERS` so the game can be tried in two browser windows by
 * someone who does not have three Google accounts to sign in with. Never below
 * two: a drawing needs somebody to guess it.
 *
 * Read on every call rather than once at import, because the socket server is
 * loaded before Next.js has read `.env.local`.
 */
export function minPlayers(): number {
  if (process.env.NODE_ENV === 'production') return MIN_PLAYERS;
  const wanted = Number(process.env.DOODLE_MIN_PLAYERS);
  return Number.isInteger(wanted) && wanted >= 2 && wanted < MIN_PLAYERS ? wanted : MIN_PLAYERS;
}

function makeRoom(roomCode: string): DoodleRoom {
  return {
    roomCode,
    players: [],
    friendWords: [],
    friendWordsOn: true,
    lastGuessAt: new Map(),
    lastReactAt: new Map(),
  };
}

export function closeDoodleRoom(code: string) {
  const room = rooms.get(code);
  if (!room) return;
  if (room.timer) clearInterval(room.timer);
  rooms.delete(code);
}

// ── Who is here, and who runs the table ─────────────────────────────────────

const online = (room: DoodleRoom) => room.players.filter((player) => player.socketIds.size > 0);
const activeIds = (room: DoodleRoom) => new Set(online(room).map((player) => player.id));

function ensureHostId(io: Server, room: DoodleRoom): Promise<string | null> {
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
function adminOf(room: DoodleRoom) {
  const present = online(room);
  return present.find((player) => player.id === room.hostId) ?? present[0];
}

async function adminDenial(io: Server, room: DoodleRoom, socket: Socket) {
  const playerId = socket.data.playerId as string | undefined;
  if (socket.data.roomCode !== room.roomCode || !playerId) return 'Join this room first.';
  await ensureHostId(io, room);
  const admin = adminOf(room);
  if (!admin) return 'Nobody is at this table.';
  if (admin.id !== playerId) return `Only ${admin.name} can run this table.`;
  return undefined;
}

// ── Telling people ──────────────────────────────────────────────────────────

/** The lobby, as one player sees it: everyone's word *count*, only your own words. */
function roomPayload(room: DoodleRoom, viewerId: string | null) {
  const admin = adminOf(room);
  return {
    minPlayers: minPlayers(),
    maxPlayers: MAX_PLAYERS,
    friendWordsOn: room.friendWordsOn,
    started: room.state !== undefined,
    admin: admin ? { id: admin.id, name: admin.name, isHost: admin.id === room.hostId } : null,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar ?? null,
      title: player.title ?? null,
      isOnline: player.socketIds.size > 0,
      words: room.friendWords.filter((word) => word.playerId === player.id).length,
    })),
    // Friend words are a surprise until they are drawn, so each player is sent
    // their own list and nobody else's.
    yourWords: room.friendWords.filter((word) => word.playerId === viewerId).map((word) => word.text),
  };
}

function syncRoomStatus(room: DoodleRoom) {
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
async function emitAll(io: Server, room: DoodleRoom) {
  syncRoomStatus(room);
  const now = Date.now();
  const sockets = await io.in(room.roomCode).fetchSockets();
  for (const peer of sockets) {
    const viewerId = (peer.data.playerId as string | undefined) ?? null;
    const seated = viewerId !== null && room.players.some((player) => player.id === viewerId);
    peer.emit('doodle:room', roomPayload(room, seated ? viewerId : null));
    peer.emit('doodle:state', room.state ? viewFor(room.state, seated ? viewerId : null, now) : null);
  }
}

/** The whole drawing so far, for someone arriving mid-round or out of step. */
function sendCanvas(target: { emit: Socket['emit'] }, room: DoodleRoom) {
  const round = room.state?.round;
  target.emit('doodle:canvas', { round: round?.number ?? 0, strokes: round?.strokes ?? [] });
}

/**
 * What the clients were last told. The clock runs constantly, but a view is
 * only worth sending when a phase, a hint or Sudden Death has actually moved.
 */
function markOf(state: DoodleState, now: number) {
  const round = state.round;
  return [
    state.phase,
    round.number,
    state.phase === 'DRAWING' ? hintStage(round, now) : '-',
    state.phase === 'DRAWING' && isSuddenDeath(round, now) ? 'sd' : '-',
    round.endsAt ?? '-',
    state.feedSeq,
  ].join('|');
}

// ── The clock ───────────────────────────────────────────────────────────────

function stopClock(room: DoodleRoom) {
  if (room.timer) clearInterval(room.timer);
  room.timer = undefined;
}

function startClock(io: Server, room: DoodleRoom) {
  stopClock(room);
  room.timer = setInterval(() => {
    const state = room.state;
    if (!state) return stopClock(room);
    // With nobody connected, nothing moves: a table that drops off together
    // comes back to the round they left, not to a game that ran out without
    // them.
    if (online(room).length === 0) return;

    const now = Date.now();
    const roundBefore = state.round.number;
    const changed = tick(state, now, Math.random, activeIds(room));
    const mark = markOf(state, now);
    if (!changed && mark === room.lastMark) return;
    room.lastMark = mark;

    // A new round is a new canvas.
    if (state.round.number !== roundBefore) sendCanvas(io.to(room.roomCode), room);
    void emitAll(io, room);

    if (state.phase === 'GAME_OVER') {
      stopClock(room);
      void recordGame(room, state);
    }
  }, TICK_MS);
}

/**
 * Keeps the finished game. No XP or stats read it yet — those are built around
 * Mendi Coat and scoped to it — but the result is on record from the first game
 * played, so whatever progression Doodle Dhamaka gets later has history to
 * start from.
 */
async function recordGame(room: DoodleRoom, state: DoodleState) {
  if (!state.final) return;
  try {
    const { prisma } = await import('@/lib/prisma');
    const row = await prisma.room.findUnique({ where: { code: room.roomCode }, select: { id: true, hostId: true } });
    if (!row) return;
    const top = state.final.standings[0]?.score ?? 0;
    await prisma.match.create({
      data: {
        gameId: 'DOODLE_DHAMAKA',
        roomId: row.id,
        hostId: row.hostId,
        status: 'FINISHED',
        finishedAt: new Date(),
        hadBots: false,
        // Round-tripped through JSON so it is plain data, which is all a JSON
        // column can hold and all Prisma's input type will accept.
        detail: JSON.parse(
          JSON.stringify({
            rounds: state.history.length,
            standings: state.final.standings,
            awards: state.final.awards,
            prompts: state.history.map((result) => ({
              drawerId: result.drawerId,
              prompt: result.prompt.text,
              outcome: result.outcome,
              dhamakas: result.dhamakas,
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
    console.error(`Could not record the Doodle Dhamaka game in room ${room.roomCode}:`, error);
  }
}

// ── Wiring ──────────────────────────────────────────────────────────────────

type Reply = (result: { error?: string; [key: string]: unknown }) => void;

export function registerDoodleHandlers(io: Server) {
  io.on('connection', (socket) => {
    const playerOf = (room: DoodleRoom) => {
      const id = socket.data.playerId as string | undefined;
      return socket.data.roomCode === room.roomCode ? room.players.find((player) => player.id === id) : undefined;
    };

    socket.on('doodle:watch', ({ roomCode }: { roomCode: string }) => {
      socket.join(roomCode);
      const room = rooms.get(roomCode);
      if (!room) return;
      socket.emit('doodle:room', roomPayload(room, null));
      socket.emit('doodle:state', room.state ? viewFor(room.state, null, Date.now()) : null);
      sendCanvas(socket, room);
    });

    socket.on(
      'doodle:join',
      ({ roomCode, playerId, playerName, playerAvatar, playerTitle }: {
        roomCode: string; playerId: string; playerName: string; playerAvatar?: string | null; playerTitle?: string | null;
      }) => {
        if (typeof roomCode !== 'string' || typeof playerId !== 'string') return;
        const room = rooms.get(roomCode) ?? makeRoom(roomCode);
        rooms.set(roomCode, room);

        let player = room.players.find((entry) => entry.id === playerId);
        if (!player) {
          if (room.players.length >= MAX_PLAYERS) {
            socket.emit('doodle:error', 'This table is full.');
            return;
          }
          player = { id: playerId, name: String(playerName).slice(0, 24), socketIds: new Set() };
          room.players.push(player);
        }
        player.avatar = playerAvatar ?? null;
        player.title = playerTitle ?? null;
        // A friend arriving mid-game joins in as a guesser from the next moment.
        if (room.state && room.state.phase !== 'GAME_OVER') addPlayer(room.state, { id: player.id, name: player.name });

        void ensureHostId(io, room);
        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.playerId = playerId;
        socket.data.name = player.name;
        player.socketIds.add(socket.id);
        socket.emit('doodle:joined', playerId);
        sendCanvas(socket, room);
        void emitAll(io, room);
      },
    );

    socket.on('doodle:add-word', ({ roomCode, text }: { roomCode: string; text: string }, reply?: Reply) => {
      const room = rooms.get(roomCode);
      const player = room && playerOf(room);
      if (!room || !player) return reply?.({ error: 'Join this room first.' });
      if (room.state) return reply?.({ error: 'Words are added before the game starts.' });
      const word = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
      if (word.length < 2 || word.length > 40 || !/\p{L}/u.test(word)) {
        return reply?.({ error: 'A word or short phrase, 2 to 40 letters.' });
      }
      const mine = room.friendWords.filter((entry) => entry.playerId === player.id);
      if (mine.length >= MAX_FRIEND_WORDS) return reply?.({ error: `Up to ${MAX_FRIEND_WORDS} words each.` });
      if (room.friendWords.some((entry) => compact(entry.text) === compact(word))) {
        return reply?.({ error: 'Someone already added that one.' });
      }
      room.friendWords.push({ playerId: player.id, text: word });
      void emitAll(io, room);
      reply?.({});
    });

    socket.on('doodle:remove-word', ({ roomCode, text }: { roomCode: string; text: string }, reply?: Reply) => {
      const room = rooms.get(roomCode);
      const player = room && playerOf(room);
      if (!room || !player) return reply?.({ error: 'Join this room first.' });
      if (room.state) return reply?.({ error: 'The game has started.' });
      room.friendWords = room.friendWords.filter((entry) => !(entry.playerId === player.id && entry.text === text));
      void emitAll(io, room);
      reply?.({});
    });

    socket.on('doodle:friend-words', async ({ roomCode, on }: { roomCode: string; on: boolean }, reply?: Reply) => {
      const room = rooms.get(roomCode);
      if (!room) return reply?.({ error: 'Room not found.' });
      const denial = await adminDenial(io, room, socket);
      if (denial) return reply?.({ error: denial });
      room.friendWordsOn = Boolean(on);
      void emitAll(io, room);
      reply?.({});
    });

    socket.on('doodle:start', async ({ roomCode }: { roomCode: string }, reply?: Reply) => {
      const room = rooms.get(roomCode);
      if (!room) return reply?.({ error: 'Room not found.' });
      const denial = await adminDenial(io, room, socket);
      if (denial) return reply?.({ error: denial });
      // Read after the await: a second click must not start a second game.
      if (room.state) return reply?.({ error: 'A game is already running.' });
      const here = online(room);
      if (here.length < minPlayers()) {
        return reply?.({ error: `Doodle Dhamaka needs at least ${minPlayers()} people here.` });
      }

      room.state = createGame({
        roomCode,
        players: here.map((player) => ({ id: player.id, name: player.name })),
        friendWords: room.friendWordsOn ? room.friendWords.map((entry) => entry.text) : [],
        now: Date.now(),
      });
      room.lastMark = undefined;
      sendCanvas(io.to(roomCode), room);
      void emitAll(io, room);
      startClock(io, room);
      reply?.({});
    });

    /** Back to the lobby — after a finished game, or to abandon one. */
    socket.on('doodle:reset', async ({ roomCode }: { roomCode: string }, reply?: Reply) => {
      const room = rooms.get(roomCode);
      if (!room) return reply?.({ error: 'Room not found.' });
      const denial = await adminDenial(io, room, socket);
      if (denial) return reply?.({ error: denial });
      stopClock(room);
      room.state = undefined;
      room.lastMark = undefined;
      sendCanvas(io.to(roomCode), room);
      void emitAll(io, room);
      reply?.({});
    });

    socket.on('doodle:choose', ({ roomCode, promptId }: { roomCode: string; promptId: string }, reply?: Reply) => {
      const room = rooms.get(roomCode);
      const player = room && playerOf(room);
      if (!room?.state || !player) return reply?.({ error: 'No game in progress.' });
      const result = choosePrompt(room.state, player.id, String(promptId), Date.now(), Math.random, activeIds(room));
      if (!result.ok) return reply?.({ error: result.reason });
      void emitAll(io, room);
      reply?.({});
    });

    socket.on(
      'doodle:guess',
      ({ roomCode, text, lock }: { roomCode: string; text: string; lock?: boolean }, reply?: Reply) => {
        const room = rooms.get(roomCode);
        const player = room && playerOf(room);
        if (!room?.state || !player) return reply?.({ error: 'No game in progress.' });
        const now = Date.now();
        // A hand held on Enter is not a hundred guesses.
        if (now - (room.lastGuessAt.get(player.id) ?? 0) < GUESS_GAP_MS) return reply?.({ error: 'Slow down 😅' });
        room.lastGuessAt.set(player.id, now);

        const outcome = submitGuess(room.state, player.id, typeof text === 'string' ? text : '', { lock: Boolean(lock) }, now);
        if (outcome.kind === 'rejected') return reply?.({ error: outcome.reason });
        // Only the one who guessed learns the outcome: whether it was right,
        // how warm it was, what it scored.
        reply?.({ outcome });
        void emitAll(io, room);
      },
    );

    socket.on('doodle:draw', ({ roomCode, op }: { roomCode: string; op: DrawOp }, reply?: Reply) => {
      const room = rooms.get(roomCode);
      const player = room && playerOf(room);
      if (!room?.state || !player) return;
      const now = Date.now();
      const result = applyDraw(room.state, player.id, op, now);
      if (!result.ok) {
        // The drawer's page drew it already; put them back in step with what
        // everyone else is actually seeing.
        sendCanvas(socket, room);
        return reply?.({ error: result.reason });
      }
      const round = room.state.round.number;
      if (op.kind === 'start') {
        const stroke = room.state.round.strokes.at(-1)!;
        socket.to(roomCode).emit('doodle:op', { round, op: { kind: 'start', stroke } });
      } else if (op.kind === 'points') {
        const stroke = room.state.round.strokes.find((entry) => entry.id === op.id)!;
        const added = Math.min(op.points.length, 300);
        socket.to(roomCode).emit('doodle:op', {
          round,
          op: { kind: 'points', id: op.id, points: stroke.points.slice(-added) },
        });
      } else {
        socket.to(roomCode).emit('doodle:op', { round, op });
      }
    });

    socket.on('doodle:react', ({ roomCode, emoji }: { roomCode: string; emoji: string }) => {
      const room = rooms.get(roomCode);
      const player = room && playerOf(room);
      if (!room || !player || !isDoodleReaction(emoji)) return;
      const now = Date.now();
      if (now - (room.lastReactAt.get(player.id) ?? 0) < REACT_GAP_MS) return;
      room.lastReactAt.set(player.id, now);
      io.to(roomCode).emit('doodle:reacted', { playerId: player.id, emoji });
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      const player = room?.players.find((entry) => entry.id === playerId);
      if (!room || !player) return;
      player.socketIds.delete(socket.id);
      // Nobody has joined a game that never started, so an empty seat in the
      // lobby is simply gone; mid-game, it is kept for when they come back.
      if (!room.state && player.socketIds.size === 0) {
        room.players = room.players.filter((entry) => entry.id !== playerId);
      }
      void emitAll(io, room);
    });
  });
}
