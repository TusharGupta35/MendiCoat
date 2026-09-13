import { prisma } from '@/lib/prisma';
import { gameForRoom, type Game } from '@/games/registry';

/**
 * The tables that exist right now.
 *
 * This is the one question the dashboard could not answer before: five friends
 * in five cities open the app to find out whether anyone is playing, and the
 * Room rows that hold the answer were never read outside the room page itself.
 *
 * "Right now" is the room table, not the socket server: a room row lives from
 * the moment it is created until the host deletes it, which is longer than any
 * single connection and survives a reload. Rooms are reset to LOBBY when the
 * socket server starts (see src/socket/server.ts), so a PLAYING row means a
 * match is genuinely under way.
 */

export interface OpenTable {
  code: string;
  name: string;
  game: Game;
  /** LOBBY — still filling up; PLAYING — a match is under way. */
  status: 'LOBBY' | 'PLAYING';
  hostName: string;
  openedAt: Date;
  seatsTaken: number;
  seatsFree: number;
  players: Array<{ userId: string; name: string; avatar: string | null; image: string | null }>;
}

const nameOf = (user: { username: string | null; name: string | null } | null) =>
  user?.username ?? user?.name ?? 'player';

/**
 * Every table anyone can see, newest first.
 *
 * No filtering by who you know: this is five friends and their guests, and a
 * table you cannot see is a table nobody joins.
 */
export async function getOpenTables(limit = 6): Promise<OpenTable[]> {
  try {
    const rooms = await prisma.room.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        code: true,
        name: true,
        gameId: true,
        status: true,
        createdAt: true,
        host: { select: { username: true, name: true } },
        players: {
          select: { id: true, username: true, name: true, avatar: true, image: true },
        },
      },
    });

    return rooms.map((room) => {
      const game = gameForRoom(room.gameId);
      const seatsTaken = room.players.length;
      return {
        code: room.code,
        name: room.name,
        game,
        // Anything that is not PLAYING is somewhere on the way to a table, and
        // reads the same to someone deciding whether to sit down.
        status: room.status === 'PLAYING' ? 'PLAYING' : 'LOBBY',
        hostName: nameOf(room.host),
        openedAt: room.createdAt,
        seatsTaken,
        seatsFree: Math.max(0, game.maxPlayers - seatsTaken),
        players: room.players.map((player) => ({
          userId: player.id,
          name: nameOf(player),
          avatar: player.avatar,
          image: player.image,
        })),
      } satisfies OpenTable;
    });
  } catch (error) {
    // A dashboard is not broken because the lobby could not be read; it just
    // has no tables to show.
    console.error('Reading the open tables failed:', error);
    return [];
  }
}
