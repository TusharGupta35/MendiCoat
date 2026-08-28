import type { GameState, SeatIndex, Suit, TeamId } from '@/types/game';

/** The minimum a seat needs to expose for a match to be recorded. */
export interface MatchSeat {
  /** The player's User id. Bots carry a synthetic id that is not a user. */
  id: string;
  isBot: boolean;
}

/** One completed trick, captured as it happens because the game state drops it. */
export interface TrickLogEntry {
  trickNumber: number;
  seats: number[];
  cards: string[];
  leadSuit: Suit;
  winnerSeat: SeatIndex;
  winnerTeam: TeamId;
  tensWon: number;
  fixedTrump: boolean;
  trumpSuit: Suit | null;
}

/**
 * Describes the trick that has just completed.
 *
 * `trumpAtTrickStart` has to be sampled when the trick was led, not just before
 * the last card: the engine fixes trump on whichever card first goes off-suit,
 * which is usually the second or third of the trick, not the fourth.
 */
export function trickEntry(
  state: GameState,
  trickNumber: number,
  trumpAtTrickStart: Suit | null,
): TrickLogEntry | null {
  const finished = state.lastTrick;
  if (!finished) return null;
  const { cards, winner } = finished;

  return {
    trickNumber,
    seats: cards.map((play) => play.seat),
    cards: cards.map((play) => play.card.code),
    leadSuit: cards[0].card.suit,
    winnerSeat: winner,
    // Read the team off the state rather than re-deriving it from the seat.
    winnerTeam: state.players[winner].team,
    tensWon: cards.filter((play) => play.card.rank === '10').length,
    fixedTrump: trumpAtTrickStart === null && state.trumpSuit !== null,
    trumpSuit: state.trumpSuit,
  };
}

/**
 * The room state's match history lives in memory and dies with the process.
 * These two calls are the durable record that career stats, rankings,
 * achievements and partner win-rates read from.
 *
 * A match is opened when it starts and closed when it finishes, so a game that
 * is abandoned half-way leaves a PENDING row behind — which is what makes
 * completion rate answerable at all.
 *
 * Bot seats get no player row: there is no user to attribute a result to. The
 * match is flagged `hadBots` so those games can be kept out of anything
 * competitive.
 */

// The custom server is imported before Next.js loads .env.local, so Prisma is
// imported lazily for the same reason syncRoomStatus does it.
const db = () => import('@/lib/prisma').then(({ prisma }) => prisma);

function humanSeats(seats: Array<MatchSeat | undefined>, state: GameState) {
  return seats.flatMap((seat, index) => {
    if (!seat || seat.isBot) return [];
    // Team comes from the game state rather than being re-derived from the seat
    // number, so this cannot drift from how the engine assigns partners.
    const team = state.players[index]?.team;
    if (!team) return [];
    return [{ userId: seat.id, seat: index, team }];
  });
}

/**
 * Opens a match as it starts. Returns the new match id, or undefined if the
 * write failed — the caller keeps playing either way.
 */
export async function openMatch(
  roomCode: string,
  seats: Array<MatchSeat | undefined>,
  state: GameState,
): Promise<string | undefined> {
  const prisma = await db();

  // Match needs the room's primary key and its host, neither of which the
  // in-memory room state tracks.
  const room = await prisma.room.findUnique({
    where: { code: roomCode },
    select: { id: true, hostId: true },
  });
  if (!room) return undefined;

  const players = humanSeats(seats, state);
  const match = await prisma.match.create({
    data: {
      roomId: room.id,
      hostId: room.hostId,
      status: 'PENDING',
      hadBots: seats.some((seat) => seat?.isBot === true),
      // Won is settled when the match closes; nobody has won yet.
      seats: { create: players.map((player) => ({ ...player, won: false })) },
      // Kept in step in the same write so `user.matches` stays usable without
      // joining through MatchPlayer.
      players: { connect: players.map(({ userId }) => ({ id: userId })) },
    },
    select: { id: true },
  });
  return match.id;
}

/**
 * Closes a finished match: the final score, who won, and the trick log.
 *
 * `matchId` may be undefined when opening the match failed. Rather than drop
 * the result, the match is created here in its finished state instead.
 */
export async function closeMatch(
  matchId: string | undefined,
  roomCode: string,
  seats: Array<MatchSeat | undefined>,
  state: GameState,
  tricks: TrickLogEntry[],
): Promise<void> {
  const prisma = await db();
  const winnerTeam = state.winnerTeam ?? 'DRAW';
  const players = humanSeats(seats, state);

  const score = {
    status: 'FINISHED',
    winnerTeam,
    capturedTensA: state.capturedTens.A,
    capturedTensB: state.capturedTens.B,
    handsWonA: state.handsWon.A,
    handsWonB: state.handsWon.B,
    finishedAt: new Date(),
  };
  const trickRows = tricks.map((trick) => ({
    trickNumber: trick.trickNumber,
    seats: trick.seats,
    cards: trick.cards,
    leadSuit: trick.leadSuit,
    winnerSeat: trick.winnerSeat,
    winnerTeam: trick.winnerTeam,
    tensWon: trick.tensWon,
    fixedTrump: trick.fixedTrump,
    trumpSuit: trick.trumpSuit,
  }));

  if (!matchId) {
    const room = await prisma.room.findUnique({
      where: { code: roomCode },
      select: { id: true, hostId: true },
    });
    if (!room) return;
    await prisma.match.create({
      data: {
        ...score,
        roomId: room.id,
        hostId: room.hostId,
        hadBots: seats.some((seat) => seat?.isBot === true),
        seats: {
          create: players.map((player) => ({ ...player, won: winnerTeam === player.team })),
        },
        players: { connect: players.map(({ userId }) => ({ id: userId })) },
        tricks: { create: trickRows },
      },
    });
    return;
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { ...score, tricks: { create: trickRows } },
  });
  if (winnerTeam !== 'DRAW') {
    await prisma.matchPlayer.updateMany({
      where: { matchId, team: winnerTeam },
      data: { won: true },
    });
  }
}
