import { prisma } from '@/lib/prisma';
import { describeMatch, type ActivityEntry } from '@/lib/activity-core';

/**
 * The feed, read from the match record.
 *
 * Mendi Coat only, because it is the only game that writes Match rows today
 * (see src/games/mendi-coat/match-store.ts). When another game persists its
 * results it gets its own sentence in activity-core rather than being forced
 * into this one — "3–1 on 10s" means nothing in a bidding game.
 */
const MENDI_COAT = 'MENDI_COAT';

export type { ActivityEntry } from '@/lib/activity-core';
export { describeMatch, joinNames } from '@/lib/activity-core';

/** The newest finished matches, as lines. */
export async function getRecentActivity(meId: string | null, limit = 5): Promise<ActivityEntry[]> {
  try {
    const matches = await prisma.match.findMany({
      where: { status: 'FINISHED', gameId: MENDI_COAT, finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
      // Read a few extra: a match whose seats were deleted with their user
      // describes to nothing, and should not shorten the feed.
      take: limit + 4,
      select: {
        id: true,
        finishedAt: true,
        winnerTeam: true,
        capturedTensA: true,
        capturedTensB: true,
        seats: {
          select: {
            userId: true,
            team: true,
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
