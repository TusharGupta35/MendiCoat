import { Server } from 'socket.io';
import { createInitialGameState, validateMove, applyMove } from '@/game-engine/mendi-coat';
import type { Card, GameState, SeatIndex } from '@/types/game';

interface RoomState {
  roomCode: string;
  players: string[];
  gameState?: GameState;
}

const rooms = new Map<string, RoomState>();

function emitState(io: Server, room: RoomState) {
  io.to(room.roomCode).emit('room-update', { players: room.players });
  if (room.gameState) io.to(room.roomCode).emit('game-state-update', room.gameState);
}

function firstLegalCard(gameState: GameState, seat: SeatIndex): Card | undefined {
  const player = gameState.players.find((entry) => entry.seat === seat);
  return player?.cards.find((card) => validateMove(gameState, seat, card).valid);
}

function advanceBots(io: Server, room: RoomState) {
  // Development bots are intentionally simple. They only choose legal cards;
  // move validation and state transitions always remain server-authoritative.
  while (room.gameState?.status === 'PLAYING' && room.gameState.currentTurn !== 0) {
    const seat = room.gameState.currentTurn;
    const card = firstLegalCard(room.gameState, seat);
    if (!card) break;
    room.gameState = applyMove(room.gameState, seat, card);
  }
  emitState(io, room);
}

export function createSocketServer(httpServer: import('node:http').Server) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    socket.on('join-room', ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
      const room = rooms.get(roomCode) ?? { roomCode, players: [] };
      const existingSeat = room.players.indexOf(playerName);
      if (existingSeat === -1 && room.players.length >= 4) {
        socket.emit('room-full');
        return;
      }

      const seat = existingSeat === -1 ? room.players.push(playerName) - 1 : existingSeat;
      rooms.set(roomCode, room);
      socket.join(roomCode);
      socket.emit('seat-assigned', seat);
      emitState(io, room);
    });

    socket.on('fill-bots', ({ roomCode }: { roomCode: string }, callback?: (result: { error?: string }) => void) => {
      if (process.env.NODE_ENV === 'production') {
        callback?.({ error: 'Bot filling is available only during development.' });
        return;
      }

      const room = rooms.get(roomCode);
      if (!room) {
        callback?.({ error: 'Connect to the room before adding bots.' });
        return;
      }
      if (room.gameState) {
        callback?.({ error: 'This test match has already started.' });
        return;
      }

      for (const name of ['Bot North', 'Bot East', 'Bot West']) {
        if (room.players.length >= 4) break;
        if (!room.players.includes(name)) room.players.push(name);
      }

      if (room.players.length !== 4) {
        callback?.({ error: 'The room needs one human player before bots can be added.' });
        return;
      }

      room.gameState = createInitialGameState(roomCode, room.players);
      rooms.set(roomCode, room);
      io.to(roomCode).emit('game-started', room.gameState);
      emitState(io, room);
      callback?.({});
    });

    socket.on('play-card', ({ roomCode, seat, card }: { roomCode: string; seat: number; card: any }) => {
      const room = rooms.get(roomCode);
      const gameState = room?.gameState;
      if (!gameState) return;

      const validation = validateMove(gameState, seat as 0 | 1 | 2 | 3, card);
      if (!validation.valid) {
        socket.emit('move-invalid', validation.reason);
        return;
      }

      const nextState = applyMove(gameState, seat as 0 | 1 | 2 | 3, card);
      room.gameState = nextState;
      rooms.set(roomCode, room);
      advanceBots(io, room);
    });
  });

  return io;
}
