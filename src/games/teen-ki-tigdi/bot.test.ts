import { describe, expect, it } from 'vitest';
import {
  MIN_BID,
  PARTNER_CALLS,
  TOTAL_POINTS,
  applyBid,
  applyContract,
  applyPlay,
  cardsInPlay,
  createInitialTigdiState,
  minimumBid,
  validateBid,
  validateContract,
  validatePlay,
  viewFor,
} from '@/games/teen-ki-tigdi/engine';
import type { TigdiPlayerCount } from '@/games/teen-ki-tigdi/engine';
import { chooseTigdiBid, chooseTigdiCard, chooseTigdiContract } from '@/games/teen-ki-tigdi/bot';
import type { TigdiState } from '@/games/teen-ki-tigdi/types';

const names = (count: number) => Array.from({ length: count }, (_, i) => `Bot ${i + 1}`);

/**
 * Plays a hand out with bots in every seat, driving it only through the public
 * entry points — so anything the engine refuses, or any turn it fails to hand
 * on, shows up here as a stall rather than as a wrong answer.
 */
function playBotHand(playerCount: TigdiPlayerCount): TigdiState {
  let state = createInitialTigdiState('BOTS', names(playerCount), { firstBidder: 0 });

  let guard = 0;
  while (state.phase === 'BIDDING') {
    if (guard += 1, guard > 200) throw new Error('bidding never closed');
    const seat = state.currentTurn;
    const amount = chooseTigdiBid(viewFor(state, seat), minimumBid(state));
    expect(validateBid(state, seat, amount).valid).toBe(true);
    state = applyBid(state, seat, amount);
  }
  if (state.phase === 'PASSED_OUT') return state;

  const bidder = state.highBidder!;
  const { trumpSuit, calledCards } = chooseTigdiContract(viewFor(state, bidder));
  const check = validateContract(state, bidder, trumpSuit, calledCards);
  expect(check.reason ?? 'ok').toBe('ok');
  state = applyContract(state, bidder, trumpSuit, calledCards);

  guard = 0;
  while (state.phase === 'PLAYING') {
    if (guard += 1, guard > 500) throw new Error('play never finished');
    const seat = state.currentTurn;
    const card = chooseTigdiCard(viewFor(state, seat));
    expect(card).toBeDefined();
    expect(validatePlay(state, seat, card!).valid).toBe(true);
    state = applyPlay(state, seat, card!);
  }
  return state;
}

describe('bots', () => {
  it.each([5, 6, 7] as TigdiPlayerCount[])(
    'play a hand out at %i seats without the engine ever refusing them',
    (count) => {
      // Repeated because the deal, the bidding jitter and the calls all vary:
      // one clean hand proves very little.
      for (let round = 0; round < 15; round += 1) {
        const state = playBotHand(count);
        if (state.phase === 'PASSED_OUT') continue;

        expect(state.phase).toBe('FINISHED');
        expect(state.players.every((player) => player.cards.length === 0)).toBe(true);
        // Every point in the deck ends up on one side or the other.
        expect(state.points.BIDDER + state.points.OPPONENT).toBe(TOTAL_POINTS);
        expect(state.result?.made).toBe(state.points.BIDDER >= state.result!.bid);
      }
    },
  );

  it('never calls a card it is holding, or one this deck size dropped', () => {
    for (let round = 0; round < 20; round += 1) {
      let state = createInitialTigdiState('BOTS', names(7), { firstBidder: 0 });
      state = applyBid(state, 0, MIN_BID);
      for (const seat of [1, 2, 3, 4, 5, 6]) state = applyBid(state, seat, null);

      const { calledCards } = chooseTigdiContract(viewFor(state, 0));
      const own = new Set(state.players[0].cards.map((card) => card.code));
      const deck = cardsInPlay(state);
      expect(calledCards).toHaveLength(PARTNER_CALLS[7]);
      for (const code of calledCards) {
        expect(own.has(code)).toBe(false);
        expect(deck.has(code)).toBe(true);
      }
    }
  });

  it('decides from a redacted view, so it cannot read another hand', () => {
    const state = createInitialTigdiState('BOTS', names(5), { firstBidder: 0 });
    const view = viewFor(state, 2);
    expect(view.players.filter((player) => player.cards !== null)).toHaveLength(1);
    // The bot's only input is this object; there is nothing else in it to cheat with.
    expect(chooseTigdiBid(view, MIN_BID)).toSatisfy(
      (bid: number | null) => bid === null || bid === MIN_BID,
    );
  });
});
