import { prisma } from '@/lib/prisma';
import { splitTables, toOpenTable, type Tables } from '@/lib/lobby-core';

/**
 * Reading the tables out of the database.
 *
 * "Right now" is the room table, not the socket server: a room row lives from
 * the moment it is created until the host deletes it, which is longer than any
 * single connection and survives a reload. Both socket servers keep `status`
 * in step with the live match (see derivedRoomStatus in each game's socket.ts)
 * and reset every PLAYING row to LOBBY when they boot, so a PLAYING row means
 * a match is genuinely under way.
 *
 * What a row then means to the player looking at it lives in lobby-core.
 */

export * from '@/lib/lobby-core';

/**
 * Every table, newest first, split into yours and everybody else's.
 *
 * No filtering by who you know: this is five friends and their guests, and a
 * table you cannot see is a table nobody joins. Seeing it is not the same as
 * getting in, which still takes the code — see lobby-core.
 */
export async function getTables(
  userId: string,
  {
    limit = 60,
    gameId,
    now = new Date(),
  }: { limit?: number; gameId?: string; now?: Date } = {},
): Promise<Tables> {
  try {
    const rooms = await prisma.room.findMany({
      // A game's own page wants its own tables; the dashboard wants all of them.
      where: gameId ? { gameId } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        code: true,
        name: true,
        gameId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        hostId: true,
        host: { select: { username: true, name: true } },
        players: {
          select: { id: true, username: true, name: true, avatar: true, image: true },
        },
      },
    });

    return splitTables(rooms.map((room) => toOpenTable(room, userId, now)));
  } catch (error) {
    // A dashboard is not broken because the lobby could not be read; it just
    // has no tables to show.
    console.error('Reading the open tables failed:', error);
    return { mine: [], global: [] };
  }
}
