import { describe, it, expect } from 'vitest';
import { applyMove } from './mendi-coat';
import type { Card, GameState, SeatIndex, Suit } from '../types/game';

function card(rank: string, suit: Suit): Card {
  return { rank, suit, code: `${rank}${suit[0]}` };
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    roomCode: 'TEST',
    status: 'PLAYING',
    currentTurn: 0,
    trumpSuit: null,
    trickNumber: 1,
    trickCards: [],
    handsWon: { A: 0, B: 0 },
    capturedTens: { A: 0, B: 0 },
    capturedTensBySuit: {
      A: { SPADES: 0, HEARTS: 0, CLUBS: 0, DIAMONDS: 0 },
      B: { SPADES: 0, HEARTS: 0, CLUBS: 0, DIAMONDS: 0 },
    },
    players: ([0, 1, 2, 3] as SeatIndex[]).map((seat) => ({
      id: `${seat + 1}`,
      name: `P${seat + 1}`,
      seat,
      cards: [],
      team: (seat === 0 || seat === 2 ? 'A' : 'B') as 'A' | 'B',
    })),
    deck: [],
    ...overrides,
  };
}

// Plays a full four-card trick in the given order and returns the resulting
// state (after the trick has been resolved).
function playTrick(
  state: GameState,
  plays: Array<[SeatIndex, Card]>,
): GameState {
  return plays.reduce((current, [seat, played]) => applyMove(current, seat, played), state);
}

describe('trump selection by first cut', () => {
  it('stays unset when everyone follows suit', () => {
    const result = playTrick(baseState(), [
      [0, card('9', 'HEARTS')],
      [1, card('K', 'HEARTS')],
      [2, card('Q', 'HEARTS')],
      [3, card('J', 'HEARTS')],
    ]);

    expect(result.trumpSuit).toBeNull();
    // Highest heart (seat 0's... no, seat 1's K) — A wasn't played, K is highest.
    expect(result.lastTrick?.winner).toBe(1);
  });

  it('sets trump immediately on the first cut, so the cutter wins that trick', () => {
    const result = playTrick(baseState(), [
      [0, card('9', 'HEARTS')],
      [1, card('K', 'HEARTS')],
      [2, card('2', 'SPADES')], // seat 2 is void in hearts and cuts
      [3, card('3', 'HEARTS')],
    ]);

    // Trump is the cutting suit, in effect from this card on — so the cutter
    // (seat 2) beats the hearts and wins the trick.
    expect(result.trumpSuit).toBe('SPADES');
    expect(result.lastTrick?.winner).toBe(2);
  });

  it('lets a later, higher card of the cutting suit over-trump the first cutter', () => {
    // Hearts led; seat 2 cuts with 4♠ (trump = spades); seat 3 over-trumps 6♠.
    const result = playTrick(baseState(), [
      [0, card('9', 'HEARTS')],
      [1, card('K', 'HEARTS')],
      [2, card('4', 'SPADES')],
      [3, card('6', 'SPADES')],
    ]);

    expect(result.trumpSuit).toBe('SPADES');
    expect(result.lastTrick?.winner).toBe(3);
  });

  it('keeps the first cutter as winner when a later player cuts a different suit', () => {
    // Hearts led; seat 2 cuts 4♠ (trump = spades); seat 3 discards 8♦, which is
    // not trump, so seat 2 still wins.
    const result = playTrick(baseState(), [
      [0, card('9', 'HEARTS')],
      [1, card('K', 'HEARTS')],
      [2, card('4', 'SPADES')],
      [3, card('8', 'DIAMONDS')],
    ]);

    expect(result.trumpSuit).toBe('SPADES');
    expect(result.lastTrick?.winner).toBe(2);
  });

  it('never changes trump once set, and honours it on later tricks', () => {
    const result = playTrick(baseState({ trumpSuit: 'SPADES', trickNumber: 3 }), [
      [0, card('9', 'HEARTS')],
      [1, card('K', 'HEARTS')],
      [2, card('2', 'SPADES')], // trump now in effect — this wins
      [3, card('3', 'HEARTS')],
    ]);

    expect(result.trumpSuit).toBe('SPADES');
    expect(result.lastTrick?.winner).toBe(2);
  });
});
