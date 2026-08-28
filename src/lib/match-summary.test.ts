import { describe, expect, it } from 'vitest';
import { buildMatchSummary, type SummaryTrick } from '@/lib/match-summary';
import { createInitialGameState } from '@/game-engine/mendi-coat';
import type { GameState, Suit } from '@/types/game';

const NAMES = ['Tushar', 'Priya', 'Arjun', 'Meera'];

function finished(overrides: Partial<GameState> = {}): GameState {
  return {
    ...createInitialGameState('AB12', NAMES),
    status: 'FINISHED',
    winnerTeam: 'A',
    capturedTens: { A: 3, B: 1 },
    handsWon: { A: 7, B: 6 },
    ...overrides,
  };
}

function trick(overrides: Partial<SummaryTrick> = {}): SummaryTrick {
  return {
    trickNumber: 1,
    seats: [0, 1, 2, 3],
    cards: ['AS', '3S', '4S', '5S'],
    winnerSeat: 0,
    tensWon: 0,
    fixedTrump: false,
    trumpSuit: null,
    ...overrides,
  };
}

const summaryOf = (tricks: SummaryTrick[], state = finished()) =>
  buildMatchSummary(state, tricks, NAMES);

describe('buildMatchSummary', () => {
  it('attributes every 10 to whoever won the trick it fell in', () => {
    const summary = summaryOf([
      trick({ trickNumber: 1, cards: ['AS', '10S', '4S', '5S'], winnerSeat: 0, tensWon: 1 }),
      trick({ trickNumber: 2, cards: ['2H', '10H', '4H', '5H'], winnerSeat: 1, tensWon: 1 }),
    ]);

    expect(summary.tenCaptures).toEqual([
      { suit: 'SPADES', card: '10S', seat: 0, name: 'Tushar', team: 'A', trickNumber: 1 },
      { suit: 'HEARTS', card: '10H', seat: 1, name: 'Priya', team: 'B', trickNumber: 2 },
    ]);
  });

  it('counts tricks and 10s per seat', () => {
    const summary = summaryOf([
      trick({ trickNumber: 1, cards: ['AS', '10S', '4S', '5S'], winnerSeat: 0, tensWon: 1 }),
      trick({ trickNumber: 2, winnerSeat: 0 }),
      trick({ trickNumber: 3, winnerSeat: 2 }),
    ]);

    expect(summary.seats[0]).toMatchObject({ name: 'Tushar', tricks: 2, tens: 1 });
    expect(summary.seats[2]).toMatchObject({ name: 'Arjun', tricks: 1, tens: 0 });
    expect(summary.seats[1]).toMatchObject({ tricks: 0, tens: 0 });
  });

  it('names the cutter, not just the trick', () => {
    // Spades led; seat 2 is void and plays a heart, fixing trump.
    const summary = summaryOf([
      trick({
        trickNumber: 4,
        cards: ['AS', '3S', '2H', '5S'],
        seats: [0, 1, 2, 3],
        winnerSeat: 2,
        fixedTrump: true,
        trumpSuit: 'HEARTS',
      }),
    ]);

    expect(summary.cut).toMatchObject({
      seat: 2,
      name: 'Arjun',
      card: '2H',
      trumpSuit: 'HEARTS',
      trickNumber: 4,
      wonIt: true,
    });
  });

  it('records a cut that was over-trumped as not won', () => {
    const summary = summaryOf([
      trick({
        cards: ['AS', '3S', '2H', 'KH'],
        winnerSeat: 3,
        fixedTrump: true,
        trumpSuit: 'HEARTS',
      }),
    ]);
    expect(summary.cut).toMatchObject({ seat: 2, wonIt: false });
  });

  it('reports no cut when the hand ran on suit', () => {
    expect(summaryOf([trick(), trick({ trickNumber: 2 })]).cut).toBeNull();
  });

  it('picks the trick carrying the most 10s, earliest on a tie', () => {
    const summary = summaryOf([
      trick({ trickNumber: 1, tensWon: 1, winnerSeat: 0 }),
      trick({ trickNumber: 2, tensWon: 2, winnerSeat: 1 }),
      trick({ trickNumber: 3, tensWon: 2, winnerSeat: 3 }),
    ]);
    expect(summary.biggestTrick).toMatchObject({ trickNumber: 2, name: 'Priya', tens: 2 });
  });

  it('calls out no biggest trick when every 10 fell in a trick of its own', () => {
    const summary = summaryOf([
      trick({ trickNumber: 1, tensWon: 1, winnerSeat: 0 }),
      trick({ trickNumber: 2, tensWon: 1, winnerSeat: 1 }),
      trick({ trickNumber: 3, tensWon: 1, winnerSeat: 2 }),
      trick({ trickNumber: 4, tensWon: 1, winnerSeat: 3 }),
    ]);
    expect(summary.biggestTrick).toBeNull();
  });

  it('ranks the player of the match on 10s first, tricks second', () => {
    const summary = summaryOf([
      // Seat 1 takes a single 10; seat 0 takes four ordinary tricks.
      trick({ trickNumber: 1, cards: ['AS', '10S', '4S', '5S'], winnerSeat: 1, tensWon: 1 }),
      trick({ trickNumber: 2, winnerSeat: 0 }),
      trick({ trickNumber: 3, winnerSeat: 0 }),
      trick({ trickNumber: 4, winnerSeat: 0 }),
    ]);
    expect(summary.mvp).toMatchObject({ name: 'Priya', tens: 1, tricks: 1 });
  });

  it('has no player of the match when no trick was played', () => {
    expect(summaryOf([]).mvp).toBeNull();
  });

  it('carries the final score straight through', () => {
    const summary = summaryOf([], finished({ winnerTeam: 'DRAW', capturedTens: { A: 2, B: 2 } }));
    expect(summary).toMatchObject({
      winnerTeam: 'DRAW',
      tens: { A: 2, B: 2 },
      tricks: { A: 7, B: 6 },
    });
  });

  it('falls back to the game state name when a seat has no room name', () => {
    const state = finished();
    const summary = buildMatchSummary(state, [trick({ winnerSeat: 3 })], [undefined, undefined, undefined, undefined] as Array<string | undefined>);
    expect(summary.seats[3].name).toBe(state.players[3].name);
  });

  it('treats a trick that fixed trump on the last card the same way', () => {
    const summary = summaryOf([
      trick({
        cards: ['AS', '3S', '4S', '2D'],
        winnerSeat: 3,
        fixedTrump: true,
        trumpSuit: 'DIAMONDS' as Suit,
      }),
    ]);
    expect(summary.cut).toMatchObject({ seat: 3, name: 'Meera', card: '2D', wonIt: true });
  });
});
