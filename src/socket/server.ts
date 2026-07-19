import { Server } from 'socket.io';
import { createInitialGameState, validateMove, applyMove } from '@/game-engine/mendi-coat';
import type { Card, GameState, SeatIndex } from '@/types/game';

interface RoomState {
  roomCode: string;
  players: Array<RoomPlayer | undefined>;
  gameState?: GameState;
}

interface RoomPlayer {
  id: string;
  name: string;
  isBot: boolean;
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

function isBotSeat(room: RoomState, seat: SeatIndex) {
  return room.players[seat]?.isBot === true;
}

function emitState(io: Server, room: RoomState) {
  io.to(room.roomCode).emit('room-update', {
    players: room.players.map((player, seat) => player ? {
      name: player.name,
      isBot: player.isBot,
      seat,
      team: seat === 0 || seat === 2 ? 'A' : 'B',
    } : null),
  });
  if (room.gameState) io.to(room.roomCode).emit('game-state-update', room.gameState);
}

function firstLegalCard(gameState: GameState, seat: SeatIndex): Card | undefined {
  const player = gameState.players.find((entry) => entry.seat === seat);
  return player?.cards.find((card) => validateMove(gameState, seat, card).valid);
}

function advanceBots(io: Server, roomCode: string, delayMs = 700) {
  // Bots are intentionally simple. They only choose legal cards;
  // move validation and state transitions always remain server-authoritative.
  setTimeout(() => {
    const room = rooms.get(roomCode);
    if (!room?.gameState || room.gameState.status !== 'PLAYING') return;

    const seat = room.gameState.currentTurn;
    if (!isBotSeat(room, seat)) return;
    const card = firstLegalCard(room.gameState, seat);
    if (!card) return;

    const completedTrick = room.gameState.trickCards.length === 3;
    room.gameState = applyMove(room.gameState, seat, card);
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

  io.on('connection', (socket) => {
    socket.on('watch-room', ({ roomCode }: { roomCode: string }) => {
      socket.join(roomCode);
      const room = rooms.get(roomCode);
      if (!room) return;
      socket.emit('room-update', {
        players: room.players.map((player, seat) => player ? {
          name: player.name,
          isBot: player.isBot,
          seat,
          team: seat === 0 || seat === 2 ? 'A' : 'B',
        } : null),
      });
      if (room.gameState) socket.emit('game-state-update', room.gameState);
    });

    socket.on('restore-seat', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
      const room = rooms.get(roomCode);
      const seat = room?.players.findIndex((player) => player?.id === playerId) ?? -1;
      if (!room || seat < 0) return;

      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      socket.data.seat = seat as SeatIndex;
      socket.emit('seat-assigned', seat);
      emitState(io, room);
    });

    socket.on('join-room', ({ roomCode, playerId, playerName, team }: { roomCode: string; playerId: string; playerName: string; team: TeamId }) => {
      const room = rooms.get(roomCode) ?? { roomCode, players: Array.from<RoomPlayer | undefined>({ length: 4 }) };
      const existingSeat = room.players.findIndex((player) => player?.id === playerId);
      const seat = existingSeat === -1 ? getAvailableSeat(room, team) : existingSeat as SeatIndex;
      if (seat === undefined) {
        socket.emit('team-full', team);
        return;
      }
      if (room.gameState && existingSeat === -1) {
        socket.emit('room-full');
        return;
      }

      if (existingSeat === -1 && room.players.every(Boolean)) {
        socket.emit('room-full');
        return;
      }

      if (existingSeat === -1) room.players[seat] = { id: playerId, name: playerName, isBot: false };
      rooms.set(roomCode, room);
      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      socket.data.seat = seat;
      socket.emit('seat-assigned', seat);
      emitState(io, room);
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
        room.players[seat] = { id: `bot-${seat}`, name: `Bot ${botNumber}`, isBot: true };
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
      const nextState = applyMove(gameState, seat, card);
      room.gameState = nextState;
      rooms.set(roomCode, room);
      emitState(io, room);
      advanceBots(io, roomCode, completedTrick ? 1800 : 700);
    });
  });

  return io;
}
