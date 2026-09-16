import { Server } from 'socket.io';
import { GAME_MODULES } from '@/games/module';
import { registerCloseRoom } from '@/lib/room-registry';
import { registerVoiceRelay } from '@/socket/voice';

/**
 * The socket server, which knows about connections and nothing about cards.
 *
 * It creates the one Socket.IO server the whole app shares, then hands each
 * game module a chance to listen on it. The games hold their own rooms, their
 * own state and their own events; this file's entire job is to exist, to sweep
 * up after a restart, and to pass a room deletion along to whichever game was
 * holding it.
 */
export function createSocketServer(httpServer: import('node:http').Server) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  /**
   * The host has deleted a room. Rooms are otherwise permanent, so this is the
   * one path that forgets one — and it has to, or a code handed out again later
   * would inherit its seats and its half-played match.
   *
   * A room code does not say which game it was a table for, so every game is
   * told. The ones that never held it do nothing.
   */
  function closeRoom(code: string) {
    for (const game of GAME_MODULES) {
      game.closeRoom(code);
      // Each game's page listens for its own name; a page only knows one of them.
      io.to(code).emit(game.closedEvent);
    }
    // Nobody is left to update, and the room must not linger in a channel.
    io.socketsLeave(code);
  }
  registerCloseRoom(closeRoom);

  // No room is live in memory at boot, so anything the database still calls
  // PLAYING is a leftover from a previous process — including every room the
  // old one-way status write stranded. This assumes a single server instance,
  // which the in-memory room maps already require.
  void import('@/lib/prisma')
    .then(({ prisma }) =>
      prisma.room.updateMany({ where: { status: 'PLAYING' }, data: { status: 'LOBBY' } }),
    )
    .catch(() => undefined);

  // Talking to the table is the same wherever the table is, so it is wired
  // once here rather than by each game.
  registerVoiceRelay(io);
  for (const game of GAME_MODULES) game.register(io);

  return io;
}
