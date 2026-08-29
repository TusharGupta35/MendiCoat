import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMove, createInitialGameState } from '@/game-engine/mendi-coat';
import type { GameState, TeamId } from '@/types/game';
import type { TrickLogEntry } from './match-store';

const { calls } = vi.hoisted(() => ({
  calls: {
    rooms: [] as string[],
    created: [] as Array<Record<string, unknown>>,
    updated: [] as Array<{ id: string; data: Record<string, unknown> }>,
    seatUpdates: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
  },
}));

const { state } = vi.hoisted(() => ({ state: { roomExists: true } }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    room: {
      findUnique: vi.fn(async ({ where }: { where: { code: string } }) => {
        calls.rooms.push(where.code);
        return state.roomExists ? { id: `room-${where.code}`, hostId: 'host-user' } : null;
      }),
    },
    match: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        calls.created.push(data);
        return { id: 'match-1' };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.updated.push({ id: where.id, data });
        return { id: where.id };
      }),
    },
    matchPlayer: {
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.seatUpdates.push(args);
        return { count: 2 };
      }),
    },
  },
}));

const { openMatch, closeMatch, trickEntry } = await import('./match-store');

function finishedState(overrides: Partial<GameState> = {}): GameState {
  const game = createInitialGameState('AB12', ['one', 'two', 'three', 'four']);
  return {
    ...game,
    status: 'FINISHED',
    winnerTeam: 'A',
    capturedTens: { A: 3, B: 1 },
    handsWon: { A: 7, B: 6 },
    trickNumber: 14,
    ...overrides,
  };
}

const human = (id: string) => ({ id, isBot: false });
const bot = (id: string) => ({ id, isBot: true });
const allHuman = [human('u1'), human('u2'), human('u3'), human('u4')];

const trick: TrickLogEntry = {
  trickNumber: 1,
  seats: [0, 1, 2, 3],
  cards: ['AS', '3S', '2H', 'KS'],
  leadSuit: 'SPADES',
  winnerSeat: 2,
  winnerTeam: 'A',
  tensWon: 0,
  fixedTrump: true,
  trumpSuit: 'HEARTS',
};

/** Every match belongs to a series; best of 5 is a target of 3. */
const series = { id: 'series-1', target: 3 };

beforeEach(() => {
  calls.rooms.length = 0;
  calls.created.length = 0;
  calls.updated.length = 0;
  calls.seatUpdates.length = 0;
  state.roomExists = true;
});

describe('openMatch', () => {
  it('opens a pending match with a row for every human seat', async () => {
    const matchId = await openMatch('AB12', allHuman, finishedState(), series);

    expect(matchId).toBe('match-1');
    expect(calls.created).toHaveLength(1);
    expect(calls.created[0]).toMatchObject({
      roomId: 'room-AB12',
      hostId: 'host-user',
      status: 'PENDING',
      hadBots: false,
      // Stamped at the deal: the room's series is in memory only, so a match
      // that does not carry it can never be put back into one.
      seriesId: 'series-1',
      seriesTarget: 3,
    });
    // Seats 1 and 3 are Team A; nobody has won anything yet.
    expect((calls.created[0].seats as { create: unknown[] }).create).toEqual([
      { userId: 'u1', seat: 0, team: 'A', won: false },
      { userId: 'u2', seat: 1, team: 'B', won: false },
      { userId: 'u3', seat: 2, team: 'A', won: false },
      { userId: 'u4', seat: 3, team: 'B', won: false },
    ]);
  });

  it('skips bot seats, flags the match, and never connects a bot as a user', async () => {
    await openMatch(
      'AB12',
      [human('u1'), bot('bot-1'), bot('bot-2'), human('u4')],
      finishedState(),
      series,
    );

    expect(calls.created[0].hadBots).toBe(true);
    expect((calls.created[0].seats as { create: Array<{ userId: string }> }).create).toEqual([
      { userId: 'u1', seat: 0, team: 'A', won: false },
      { userId: 'u4', seat: 3, team: 'B', won: false },
    ]);
    expect((calls.created[0].players as { connect: Array<{ id: string }> }).connect).toEqual([
      { id: 'u1' },
      { id: 'u4' },
    ]);
  });

  it('returns nothing when the room is gone', async () => {
    state.roomExists = false;
    expect(await openMatch('AB12', allHuman, finishedState(), series)).toBeUndefined();
    expect(calls.created).toHaveLength(0);
  });
});

describe('closeMatch', () => {
  it('writes the final score and the trick log onto the open match', async () => {
    await closeMatch('match-1', 'AB12', allHuman, finishedState(), [trick], series);

    expect(calls.created).toHaveLength(0);
    expect(calls.updated).toHaveLength(1);
    expect(calls.updated[0].id).toBe('match-1');
    expect(calls.updated[0].data).toMatchObject({
      status: 'FINISHED',
      winnerTeam: 'A',
      capturedTensA: 3,
      capturedTensB: 1,
      handsWonA: 7,
      handsWonB: 6,
    });
    expect((calls.updated[0].data.tricks as { create: unknown[] }).create).toEqual([
      {
        trickNumber: 1,
        seats: [0, 1, 2, 3],
        cards: ['AS', '3S', '2H', 'KS'],
        leadSuit: 'SPADES',
        winnerSeat: 2,
        winnerTeam: 'A',
        tensWon: 0,
        fixedTrump: true,
        trumpSuit: 'HEARTS',
      },
    ]);
  });

  it('marks only the winning team as having won', async () => {
    await closeMatch(
      'match-1',
      'AB12',
      allHuman,
      finishedState({ winnerTeam: 'B' as TeamId }),
      [],
      series,
    );

    expect(calls.seatUpdates).toEqual([
      { where: { matchId: 'match-1', team: 'B' }, data: { won: true } },
    ]);
  });

  it('marks nobody as having won a drawn match', async () => {
    await closeMatch(
      'match-1',
      'AB12',
      allHuman,
      finishedState({ winnerTeam: 'DRAW' }),
      [],
      series,
    );

    expect(calls.updated[0].data.winnerTeam).toBe('DRAW');
    expect(calls.seatUpdates).toEqual([]);
  });

  it('creates the match outright when opening it had failed', async () => {
    await closeMatch(undefined, 'AB12', allHuman, finishedState(), [trick], series);

    expect(calls.updated).toHaveLength(0);
    expect(calls.created).toHaveLength(1);
    expect(calls.created[0]).toMatchObject({ status: 'FINISHED', winnerTeam: 'A' });
    // The result is not lost: winners are settled in the same write.
    expect((calls.created[0].seats as { create: Array<{ won: boolean; team: string }> }).create).toEqual([
      { userId: 'u1', seat: 0, team: 'A', won: true },
      { userId: 'u2', seat: 1, team: 'B', won: false },
      { userId: 'u3', seat: 2, team: 'A', won: true },
      { userId: 'u4', seat: 3, team: 'B', won: false },
    ]);
    expect((calls.created[0].tricks as { create: unknown[] }).create).toHaveLength(1);
  });

  it('gives up quietly when there is no match and no room to attach one to', async () => {
    state.roomExists = false;
    await closeMatch(undefined, 'AB12', allHuman, finishedState(), [], series);
    expect(calls.created).toHaveLength(0);
  });
});

describe('trickEntry', () => {
  /** Plays four given cards into a fresh state, returning the state after each. */
  function playTrick(codes: string[]) {
    let state = createInitialGameState('AB12', ['one', 'two', 'three', 'four']);
    state = { ...state, currentTurn: 0 };
    // Give each seat the exact card it needs to play.
    state.players = state.players.map((player, index) => ({
      ...player,
      cards: [card(codes[index])],
    }));
    const trumpAtStart = state.trumpSuit;
    for (let seat = 0; seat < 4; seat += 1) {
      state = applyMove(state, seat as 0 | 1 | 2 | 3, card(codes[seat]));
    }
    return { state, trumpAtStart };
  }

  const SUIT_OF: Record<string, 'SPADES' | 'HEARTS' | 'CLUBS' | 'DIAMONDS'> = {
    S: 'SPADES',
    H: 'HEARTS',
    C: 'CLUBS',
    D: 'DIAMONDS',
  };
  function card(code: string) {
    return { rank: code.slice(0, -1), suit: SUIT_OF[code.slice(-1)], code };
  }

  it('flags the cutting trick when the cut lands on the second card', () => {
    // Spades led, seat 2 is void and plays a heart: trump is fixed mid-trick.
    const { state, trumpAtStart } = playTrick(['AS', '2H', '3S', '4S']);
    const entry = trickEntry(state, 1, trumpAtStart);
    expect(entry?.fixedTrump).toBe(true);
    expect(entry?.trumpSuit).toBe('HEARTS');
  });

  it('flags it just the same when the cut is the last card', () => {
    const { state, trumpAtStart } = playTrick(['AS', '3S', '4S', '2H']);
    expect(trickEntry(state, 1, trumpAtStart)?.fixedTrump).toBe(true);
  });

  it('does not flag a trick where everyone followed suit', () => {
    const { state, trumpAtStart } = playTrick(['AS', '3S', '4S', '5S']);
    const entry = trickEntry(state, 1, trumpAtStart);
    expect(entry?.fixedTrump).toBe(false);
    expect(entry?.trumpSuit).toBeNull();
  });

  it('does not flag a later trick once trump is already set', () => {
    const { state } = playTrick(['AS', '2H', '3S', '4S']);
    // Trump was fixed on the trick before, so this one did not fix anything.
    const entry = trickEntry(state, 2, 'HEARTS');
    expect(entry?.fixedTrump).toBe(false);
  });

  it('records the cards, the winner and the tens taken', () => {
    const { state, trumpAtStart } = playTrick(['AS', '10S', '3S', '4S']);
    const entry = trickEntry(state, 1, trumpAtStart);
    expect(entry).toMatchObject({
      trickNumber: 1,
      seats: [0, 1, 2, 3],
      cards: ['AS', '10S', '3S', '4S'],
      leadSuit: 'SPADES',
      winnerSeat: 0,
      winnerTeam: 'A',
      tensWon: 1,
    });
  });
});
