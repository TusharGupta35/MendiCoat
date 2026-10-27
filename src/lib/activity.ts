import { prisma } from '@/lib/prisma';
import { describeMatch, type ActivityEntry } from '@/lib/activity-core';

/**
 * The feed, read from the match record — every game that keeps one. Each game
 * gets its own sentence in activity-core rather than being forced into Mendi
 * Coat's: "3–1 on 10s" means nothing in a bidding game.
 */

export type { ActivityEntry } from '@/lib/activity-core';
export { describeMatch, joinNames } from '@/lib/activity-core';

/** The newest finished matches, as lines. */
export async function getRecentActivity(meId: string | null, limit = 5): Promise<ActivityEntry[]> {
  try {
    const matches = await prisma.match.findMany({
      where: { status: 'FINISHED', finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
      // Read a few extra: a match whose seats were deleted with their user
      // describes to nothing, and should not shorten the feed.
      take: limit + 4,
      select: {
        id: true,
        gameId: true,
        detail: true,
        finishedAt: true,
        winnerTeam: true,
        capturedTensA: true,
        capturedTensB: true,
        seats: {
          select: {
            userId: true,
            team: true,
            won: true,
            user: { select: { username: true, name: true } },
          },
        },
      },
    });

    return matches
      .map((match) =>
        describeMatch(
          {
            ...match,
            seats: match.seats.map((seat) => ({
              userId: seat.userId,
              name: seat.user?.username ?? seat.user?.name ?? 'player',
              team: seat.team,
              won: seat.won,
            })),
          },
          meId,
        ),
      )
      .filter((entry): entry is ActivityEntry => entry !== null)
      .slice(0, limit);
  } catch (error) {
    console.error('Reading the activity feed failed:', error);
    return [];
  }
}
