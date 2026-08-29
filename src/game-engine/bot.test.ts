import { describe, expect, it } from 'vitest';
import { chooseBotCard, wouldWin } from '@/game-engine/bot';
import { createInitialGameState } from '@/game-engine/mendi-coat';
import type { Card, GameState, SeatIndex, Suit, TrickPlay } from '@/types/game';

const SUIT_OF: Record<string, Suit> = { S: 'SPADES', H: 'HEARTS', C: 'CLUBS', D: 'DIAMONDS' };
const card = (code: string): Card => ({
  rank: code.slice(0, -1),
  suit: SUIT_OF[code.slice(-1)],
  code,
});

/** A game state with chosen hands and a chosen trick already in progress. */
function table(options: {
  hands: Record<number, string[]>;
  trick?: Array<[SeatIndex, string]>;
  trump?: Suit | null;
  /** Whose turn it is. The engine deals a random starting seat, and
   *  validateMove rejects anything played out of turn. */
  turn: SeatIndex;
}): GameState {
  const base = createInitialGameState('AB12', ['s0', 's1', 's2', 's3']);
  return {
    ...base,
    currentTurn: options.turn,
    trumpSuit: options.trump ?? null,
    trickCards: (options.trick ?? []).map(
      ([seat, code]): TrickPlay => ({ seat, card: card(code) }),
    ),
    players: base.players.map((player) => ({
      ...player,
      cards: (options.hands[player.seat] ?? []).map(card),
    })),
  };
}

describe('wouldWin', () => {
  it('knows a higher card of the led suit takes it', () => {
    const state = table({ hands: { 1: ['KS', '3S'] }, trick: [[0, 'QS']], turn: 1 });
    expect(wouldWin(state, 1, card('KS'))).toBe(true);
    expect(wouldWin(state, 1, card('3S'))).toBe(false);
  });

  it('counts a first off-suit card as fixing trump and winning with it', () => {
    // Nothing is trump yet; seat 1 is void in spades, so this heart cuts.
    const state = table({ hands: { 1: ['2H'] }, trick: [[0, 'AS']], turn: 1 });
    expect(wouldWin(state, 1, card('2H'))).toBe(true);
  });

  it('knows a plain card cannot beat an established trump', () => {
    const state = table({ hands: { 2: ['AS'] }, trick: [[0, 'QS'], [1, '2H']], trump: 'HEARTS', turn: 2 });
    expect(wouldWin(state, 2, card('AS'))).toBe(false);
  });
});

describe('chooseBotCard', () => {
  it('always returns a legal card', () => {
    // Seat 1 holds spades, so it must follow spades.
    const state = table({ hands: { 1: ['3S', 'KH', '2D'] }, trick: [[0, 'AS']], turn: 1 });
    expect(chooseBotCard(state, 1)?.code).toBe('3S');
  });

  it('gives a 10 to a partner who is winning the trick', () => {
    // Seat 0 (partner of seat 2) is winning with the ace.
    const state = table({ hands: { 2: ['10S', '3S'] }, trick: [[0, 'AS'], [1, '4S']], turn: 2 });
    expect(chooseBotCard(state, 2)?.code).toBe('10S');
  });

  it('never throws a 10 into a trick an opponent is winning', () => {
    // Seat 1 is an opponent of seat 2 and is winning; seat 2 cannot beat it.
    const state = table({ hands: { 2: ['10S', '3S', '4S'] }, trick: [[0, '5S'], [1, 'AS']], turn: 2 });
    const choice = chooseBotCard(state, 2);
    expect(choice?.code).not.toBe('10S');
    expect(choice?.code).toBe('3S');
  });

  it('wins with the cheapest card that does the job', () => {
    const state = table({ hands: { 1: ['KS', 'QS', '9S'] }, trick: [[0, 'JS']], turn: 1 });
    expect(chooseBotCard(state, 1)?.code).toBe('QS');
  });

  it('does not waste a high card when it cannot win', () => {
    const state = table({ hands: { 1: ['QS', '3S'] }, trick: [[0, 'AS']], turn: 1 });
    expect(chooseBotCard(state, 1)?.code).toBe('3S');
  });

  it('spends a 10 to take a trick that already carries one', () => {
    // Seat 2's only winning card is its 10; an opponent leads and is winning.
    const state = table({ hands: { 2: ['10S', '2S'] }, trick: [[0, '9S'], [1, '3S']], turn: 2 });
    expect(chooseBotCard(state, 2)?.code).toBe('10S');
  });

  it('leads from its longest suit and holds back its 10s', () => {
    const state = table({ hands: { 0: ['10H', 'KH', '9H', '3S'] }, turn: 0 });
    expect(chooseBotCard(state, 0)?.code).toBe('KH');
  });

  it('keeps trump back when leading, given another suit to lead', () => {
    const state = table({ hands: { 0: ['AH', 'KS', '9S'] }, trump: 'HEARTS', turn: 0 });
    expect(chooseBotCard(state, 0)?.code).toBe('KS');
  });

  it('plays its only card, even when that card is a 10', () => {
    const state = table({ hands: { 1: ['10S'] }, trick: [[0, 'AS']], turn: 1 });
    expect(chooseBotCard(state, 1)?.code).toBe('10S');
  });

  it('has nothing to play from an empty hand', () => {
    expect(chooseBotCard(table({ hands: { 1: [] }, turn: 1 }), 1)).toBeUndefined();
  });

  it('still only picks legal cards on easy', () => {
    const state = table({ hands: { 1: ['3S', '9S', 'KH'] }, trick: [[0, 'AS']], turn: 1 });
    for (let i = 0; i < 25; i += 1) {
      expect(chooseBotCard(state, 1)?.suit).toBe('SPADES');
    }
  });
});
