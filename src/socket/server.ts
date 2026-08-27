import { Server } from 'socket.io';
import { createInitialGameState, validateMove, applyMove } from '@/game-engine/mendi-coat';
import type { Card, GameState, MatchResult, SeatIndex } from '@/types/game';

interface RoomState {
  roomCode: string;
  players: Array<RoomPlayer | undefined>;
  gameState?: GameState;
  matchHistory: MatchResult[];
  /** Last status written to the database, so we only write on an actual change. */
  persistedStatus?: RoomStatus;
  /** Pending hand-back to the lobby for a room every human has left. */
  resetTimer?: ReturnType<typeof setTimeout>;
}

type RoomStatus = 'LOBBY' | 'PLAYING';

interface RoomPlayer {
  id: string;
  name: string;
  isBot: boolean;
  socketIds: Set<string>;
}

type TeamId = 'A' | 'B';

const rooms = new Map<string, RoomState>();

const TEAM_SEATS: Record<TeamId, SeatIndex[]> = {
  A: [0, 2],
  B: [1, 3],
};

function getAvailableSeat(room: RoomState, team: TeamId): SeatIndex | undefined {
  return TEAM_SEATS[team].find((seat) => !room.players[seat]);
}

function seatTeam(seat: SeatIndex | number): TeamId {
  return seat === 0 || seat === 2 ? 'A' : 'B';
}

function isBotSeat(room: RoomState, seat: SeatIndex) {
  return room.players[seat]?.isBot === true;
}

function roomPlayersPayload(room: RoomState) {
  return room.players.map((player, seat) => player ? {
    name: player.name,
    isBot: player.isBot,
    isOnline: !player.isBot && player.socketIds.size > 0,
    seat,
    team: seatTeam(seat),
  } : null);
}

function markPlayerConnected(room: RoomState, playerId: string, socketId: string) {
  room.players.find((player) => player?.id === playerId)?.socketIds.add(socketId);
}

/** How long an emptied-out room keeps its seats and match before resetting. */
const EMPTY_ROOM_RESET_MS = 60_000;

function hasConnectedHuman(room: RoomState) {
  return room.players.some((player) => player && !player.isBot && player.socketIds.size > 0);
}

// A room is only "playing" while a live match has somebody watching it. A
// finished match and an abandoned room both belong back in the lobby, so the
// dashboard and the join route stop advertising a game nobody is in.
function derivedRoomStatus(room: RoomState): RoomStatus {
  const liveMatch = room.gameState?.status === 'PLAYING';
  return liveMatch && hasConnectedHuman(room) ? 'PLAYING' : 'LOBBY';
}

function syncRoomStatus(room: RoomState) {
  const status = derivedRoomStatus(room);
  if (room.persistedStatus === status) return;
  room.persistedStatus = status;
  // The custom server is imported before Next.js loads .env.local. Importing
  // Prisma lazily avoids reading DATABASE_URL too early.
  void import('@/lib/prisma')
    .then(({ prisma }) => prisma.room.update({ where: { code: room.roomCode }, data: { status } }))
    .catch(() => {
      // Leave the next state change free to retry the write.
      if (room.persistedStatus === status) room.persistedStatus = undefined;
    });
}

/** True while the room still holds something a reset would clear. */
function roomNeedsReset(room: RoomState) {
  return room.gameState !== undefined || room.players.some(Boolean);
}

// Everyone disconnecting at once is usually a blip — a reload, a dropped
// network — so an emptied room keeps its seats and its match for a grace
// period. Only once that passes with nobody back does it return to a fresh
// lobby, which also frees the seats ghosts were holding.
function scheduleEmptyRoomReset(io: Server, room: RoomState) {
  if (hasConnectedHuman(room) || !roomNeedsReset(room)) {
    if (room.resetTimer) clearTimeout(room.resetTimer);
    room.resetTimer = undefined;
    return;
  }
  if (room.resetTimer) return;

  room.resetTimer = setTimeout(() => {
    room.resetTimer = undefined;
    // The room may have been recreated, or refilled, while the timer ran.
    if (rooms.get(room.roomCode) !== room || hasConnectedHuman(room)) return;
    room.players = Array.from<RoomPlayer | undefined>({ length: 4 });
    room.gameState = undefined;
    // Match history is the room's own record, so it survives the reset.
    io.to(room.roomCode).emit('room-reset');
    emitState(io, room);
  }, EMPTY_ROOM_RESET_MS);
}

function emitState(io: Server, room: RoomState) {
  // Every mutation funnels through here, so deriving the room's status at this
  // one point keeps the database honest without every handler remembering to.
  syncRoomStatus(room);
  scheduleEmptyRoomReset(io, room);
  io.to(room.roomCode).emit('room-update', {
    players: roomPlayersPayload(room),
  });
  io.to(room.roomCode).emit('match-history', room.matchHistory);
  if (room.gameState) io.to(room.roomCode).emit('game-state-update', room.gameState);
}

// Applies a validated move and records the result the moment the match finishes,
// so a room's match history survives every restart-game reset of the game state.
function commitMove(room: RoomState, seat: SeatIndex, card: Card) {
  const wasFinished = room.gameState!.status === 'FINISHED';
  const nextState = applyMove(room.gameState!, seat, card);
  room.gameState = nextState;
  if (!wasFinished && nextState.status === 'FINISHED' && nextState.winnerTeam) {
    room.matchHistory.push({
      winnerTeam: nextState.winnerTeam,
      capturedTens: { ...nextState.capturedTens },
      handsWon: { ...nextState.handsWon },
    });
  }
  return nextState;
}

function pickBotCard(gameState: GameState, seat: SeatIndex): Card | undefined {
  const player = gameState.players.find((entry) => entry.seat === seat);
  if (!player) return undefined;
  // Hands are suit-sorted (spades first), so always taking the first legal card
  // would make a leading bot open with a spade every time — which fixes trump to
  // spades on trick 1. Pick a random legal card instead.
  const legalCards = player.cards.filter((card) => validateMove(gameState, seat, card).valid);
  if (legalCards.length === 0) return undefined;
  return legalCards[Math.floor(Math.random() * legalCards.length)];
}

function advanceBots(io: Server, roomCode: string, delayMs = 700) {
  // Bots are intentionally simple. They only choose legal cards;
  // move validation and state transitions always remain server-authoritative.
  setTimeout(() => {
    const room = rooms.get(roomCode);
    if (!room?.gameState || room.gameState.status !== 'PLAYING') return;

    const seat = room.gameState.currentTurn;
    if (!isBotSeat(room, seat)) return;
    const card = pickBotCard(room.gameState, seat);
    if (!card) return;

    const completedTrick = room.gameState.trickCards.length === 3;
    commitMove(room, seat, card);
    rooms.set(roomCode, room);
    emitState(io, room);
    // Keep the four completed cards on-screen before the following bot move.
    advanceBots(io, roomCode, completedTrick ? 1800 : 700);
  }, delayMs);
}

export function createSocketServer(httpServer: import('node:http').Server) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // No room is live in memory at boot, so anything the database still calls
  // PLAYING is a leftover from a previous process — including every room the
  // old one-way status write stranded. This assumes a single server instance,
  // which the in-memory room map already requires.
  void import('@/lib/prisma')
    .then(({ prisma }) => prisma.room.updateMany({ where: { status: 'PLAYING' }, data: { status: 'LOBBY' } }))
    .catch(() => undefined);

  io.on('connection', (socket) => {
    socket.on('watch-room', ({ roomCode }: { roomCode: string }) => {
      socket.join(roomCode);
      const room = rooms.get(roomCode);
      if (!room) return;
      socket.emit('room-update', {
        players: roomPlayersPayload(room),
      });
      socket.emit('match-history', room.matchHistory);
      if (room.gameState) socket.emit('game-state-update', room.gameState);
    });

    socket.on('restore-seat', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
      const room = rooms.get(roomCode);
      const seat = room?.players.findIndex((player) => player?.id === playerId) ?? -1;
      if (!room || seat < 0) return;

      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      socket.data.seat = seat as SeatIndex;
      socket.data.playerId = playerId;
      socket.data.name = room.players[seat]?.name ?? 'Player';
      markPlayerConnected(room, playerId, socket.id);
      socket.emit('seat-assigned', seat);
      emitState(io, room);
    });

    socket.on('join-room', ({ roomCode, playerId, playerName, team }: { roomCode: string; playerId: string; playerName: string; team: TeamId }) => {
      const room = rooms.get(roomCode) ?? { roomCode, players: Array.from<RoomPlayer | undefined>({ length: 4 }), matchHistory: [] };
      const existingSeat = room.players.findIndex((player) => player?.id === playerId);
      const seat = existingSeat === -1 ? getAvailableSeat(room, team) : existingSeat as SeatIndex;
      if (seat === undefined) {
        socket.emit('team-full', team);
        return;
      }
      if (room.gameState && existingSeat === -1) {
        socket.emit('game-already-started');
        return;
      }

      if (existingSeat === -1 && room.players.every(Boolean)) {
        socket.emit('room-full');
        return;
      }

      if (existingSeat === -1) room.players[seat] = { id: playerId, name: playerName, isBot: false, socketIds: new Set() };
      rooms.set(roomCode, room);
      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      socket.data.seat = seat;
      socket.data.playerId = playerId;
      socket.data.name = playerName;
      markPlayerConnected(room, playerId, socket.id);
      socket.emit('seat-assigned', seat);
      emitState(io, room);
    });

    // Players may move between teams for as long as the room is still in the
    // lobby; once a game state exists the seats are locked to the dealt hands.
    socket.on('switch-team', ({ roomCode, team }: { roomCode: string; team: TeamId }, callback?: (result: { error?: string }) => void) => {
      const room = rooms.get(roomCode);
      const playerId = socket.data.playerId as string | undefined;
      if (!room || socket.data.roomCode !== roomCode || !playerId) {
        callback?.({ error: 'Join the room before switching teams.' });
        return;
      }
      if (room.gameState) {
        callback?.({ error: 'The match has already started.' });
        return;
      }

      const currentSeat = room.players.findIndex((player) => player?.id === playerId);
      if (currentSeat < 0) {
        callback?.({ error: 'Join the room before switching teams.' });
        return;
      }
      if (seatTeam(currentSeat as SeatIndex) === team) {
        callback?.({});
        return;
      }

      const targetSeat = getAvailableSeat(room, team);
      if (targetSeat === undefined) {
        callback?.({ error: `Team ${team} is full. Ask someone there to switch first.` });
        return;
      }

      const player = room.players[currentSeat]!;
      room.players[currentSeat] = undefined;
      room.players[targetSeat] = player;
      rooms.set(roomCode, room);

      // The player may have the room open in more than one tab; every socket of
      // theirs holds a seat in socket.data that play-card later trusts.
      for (const socketId of player.socketIds) {
        const peer = io.sockets.sockets.get(socketId);
        if (!peer) continue;
        peer.data.seat = targetSeat;
        peer.emit('seat-assigned', targetSeat);
      }
      emitState(io, room);
      callback?.({});
    });

    socket.on('fill-bots', ({ roomCode }: { roomCode: string }, callback?: (result: { error?: string }) => void) => {
      const room = rooms.get(roomCode);
      if (!room) {
        callback?.({ error: 'Connect to the room before adding bots.' });
        return;
      }
      if (room.gameState) {
        callback?.({ error: 'This test match has already started.' });
        return;
      }

      let botNumber = 1;
      for (let seat = 0; seat < 4; seat += 1) {
        if (room.players[seat]) continue;
        room.players[seat] = { id: `bot-${seat}`, name: `Bot ${botNumber}`, isBot: true, socketIds: new Set() };
        botNumber += 1;
      }

      if (!room.players.every(Boolean)) {
        callback?.({ error: 'Unable to add bots to every open seat.' });
        return;
      }

      room.gameState = createInitialGameState(roomCode, room.players.map((player) => player!.name));
      rooms.set(roomCode, room);
      io.to(roomCode).emit('game-started', room.gameState);
      emitState(io, room);
      callback?.({});
      advanceBots(io, roomCode);
    });

    socket.on(
      "start-game",
      ({ roomCode }: { roomCode: string }, callback?: (result: { error?: string }) => void) => {
        const room = rooms.get(roomCode);

        if (!room) {
          callback?.({ error: "Room not found." });
          return;
        }

        if (room.gameState) {
          callback?.({ error: "Game already started." });
          return;
        }

        if (!room.players.every(Boolean)) {
          callback?.({ error: "All four seats must be filled." });
          return;
        }

        room.gameState = createInitialGameState(
          roomCode,
          room.players.map((player) => player!.name)
        );

        rooms.set(roomCode, room);

        io.to(roomCode).emit("game-started", room.gameState);
        emitState(io, room);

        callback?.({});

        advanceBots(io, roomCode);
      }
    );

    socket.on('restart-game', ({ roomCode }: { roomCode: string }, callback?: (result: { error?: string }) => void) => {
      const room = rooms.get(roomCode);
      if (!room?.gameState || room.gameState.status !== 'FINISHED') {
        callback?.({ error: 'Finish the current match before starting another one.' });
        return;
      }
      const seat = socket.data.seat as SeatIndex | undefined;
      if (socket.data.roomCode !== roomCode || seat === undefined || isBotSeat(room, seat)) {
        callback?.({ error: 'Only a human player in this room can start the next match.' });
        return;
      }

      if (!room.players.every(Boolean)) {
        callback?.({ error: 'All four seats must be filled before restarting.' });
        return;
      }

      room.gameState = createInitialGameState(roomCode, room.players.map((player) => player!.name));
      rooms.set(roomCode, room);
      io.to(roomCode).emit('game-started', room.gameState);
      emitState(io, room);
      callback?.({});
      advanceBots(io, roomCode);
    });

    socket.on('send-thought', ({ roomCode, message }: { roomCode: string; message: string }, callback?: (result: { error?: string }) => void) => {
      const room = rooms.get(roomCode);
      const seat = socket.data.seat as SeatIndex | undefined;
      const text = typeof message === 'string' ? message.trim().slice(0, 80) : '';

      if (!room || socket.data.roomCode !== roomCode || seat === undefined || isBotSeat(room, seat)) {
        callback?.({ error: 'Join the room before sending a thought.' });
        return;
      }
      if (!text) {
        callback?.({ error: 'Write a thought before sending it.' });
        return;
      }

      io.to(roomCode).emit('room-thought', { name: room.players[seat]?.name ?? 'Player', message: text });
      callback?.({});
    });

    socket.on('play-card', ({ roomCode, card }: { roomCode: string; card: Card }) => {
      const room = rooms.get(roomCode);
      const gameState = room?.gameState;
      if (!gameState) return;

      const seat = socket.data.seat as SeatIndex | undefined;
      if (socket.data.roomCode !== roomCode || seat === undefined || isBotSeat(room, seat)) {
        socket.emit('move-invalid', 'You cannot play for this seat.');
        return;
      }

      const validation = validateMove(gameState, seat, card);
      if (!validation.valid) {
        socket.emit('move-invalid', validation.reason);
        return;
      }

      const completedTrick = gameState.trickCards.length === 3;
      commitMove(room, seat, card);
      rooms.set(roomCode, room);
      emitState(io, room);
      advanceBots(io, roomCode, completedTrick ? 1800 : 700);
    });

    // --- Voice chat signalling ---
    // The server only relays the WebRTC handshake between peers; the audio
    // streams themselves flow directly browser-to-browser and never pass here.
    socket.on('voice-join', async ({ roomCode }: { roomCode: string }) => {
      if (socket.data.roomCode !== roomCode) return;
      const voiceRoom = `voice:${roomCode}`;
      const existing = await io.in(voiceRoom).fetchSockets();
      const peers = existing
        .filter((peer) => peer.id !== socket.id)
        .map((peer) => ({ peerId: peer.id, name: (peer.data.name as string) ?? 'Player' }));

      socket.join(voiceRoom);
      // The newcomer receives the existing peers and initiates offers to them.
      socket.emit('voice-peers', peers);
      socket.to(voiceRoom).emit('voice-peer-joined', {
        peerId: socket.id,
        name: (socket.data.name as string) ?? 'Player',
      });
    });

    socket.on('voice-signal', ({ to, data }: { to: string; data: unknown }) => {
      const roomCode = socket.data.roomCode as string | undefined;
      if (!roomCode) return;
      // Only relay between two sockets that both share this room's voice channel.
      const members = io.sockets.adapter.rooms.get(`voice:${roomCode}`);
      if (!members?.has(socket.id) || !members.has(to)) return;
      io.to(to).emit('voice-signal', { from: socket.id, data });
    });

    socket.on('voice-leave', ({ roomCode }: { roomCode: string }) => {
      const voiceRoom = `voice:${roomCode}`;
      socket.leave(voiceRoom);
      socket.to(voiceRoom).emit('voice-peer-left', { peerId: socket.id });
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (roomCode) {
        socket.to(`voice:${roomCode}`).emit('voice-peer-left', { peerId: socket.id });
      }
      if (!roomCode || !playerId) return;

      const room = rooms.get(roomCode);
      const player = room?.players.find((entry) => entry?.id === playerId);
      if (!room || !player) return;
      player.socketIds.delete(socket.id);
      emitState(io, room);
    });
  });

  return io;
}
