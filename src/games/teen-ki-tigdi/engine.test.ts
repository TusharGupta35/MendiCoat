import { describe, expect, it } from 'vitest';
import {
  BID_STEP,
  CARDS_PER_PLAYER,
  MIN_BID,
  PARTNER_CALLS,
  TIGDI,
  TOTAL_POINTS,
  applyBid,
  applyContract,
  applyPlay,
  buildDeck,
  cardPoints,
  createInitialTigdiState,
  determineTrickWinner,
  minimumBid,
  validateBid,
  validateContract,
  validatePlay,
  viewFor,
} from '@/games/teen-ki-tigdi/engine';
import type { Card } from '@/types/game';
import type { TigdiPlayerCount } from '@/games/teen-ki-tigdi/engine';
import type { TigdiState } from '@/games/teen-ki-tigdi/types';

const names = (count: number) => Array.from({ length: count }, (_, i) => `P${i + 1}`);
const counts: TigdiPlayerCount[] = [5, 6, 7];

const card = (code: string): Card => {
  const rank = code.slice(0, -1);
  const suit = ({ S: 'SPADES', H: 'HEARTS', C: 'CLUBS', D: 'DIAMONDS' } as const)[code.slice(-1) as 'S'];
  return { rank, suit, code };
};

/** Deals the given hands verbatim, so a hand can be set up card by card. */
function stateWithHands(hands: string[][]): TigdiState {
  const state = createInitialTigdiState('TEST', names(hands.length), { firstBidder: 0 });
  state.players.forEach((player, seat) => {
    player.cards = hands[seat].map(card);
  });
  return state;
}

describe('the deck', () => {
  it.each(counts)('deals evenly to %i players', (count) => {
    const deck = buildDeck(count);
    expect(deck).toHaveLength(count * CARDS_PER_PLAYER[count]);
    expect(new Set(deck.map((c) => c.code)).size).toBe(deck.length);
  });

  it.each(counts)('still holds all 250 points at %i players', (count) => {
    const total = buildDeck(count).reduce((sum, c) => sum + cardPoints(c), 0);
    expect(total).toBe(TOTAL_POINTS);
  });

  it.each(counts)('never removes the tigdi at %i players', (count) => {
    expect(buildDeck(count).some((c) => c.code === TIGDI)).toBe(true);
  });

  it('scores the 3 of spades at 30 and every other 3 at nothing', () => {
    expect(cardPoints(card('3S'))).toBe(30);
    expect(cardPoints(card('3H'))).toBe(0);
    expect(cardPoints(card('AS'))).toBe(10);
    expect(cardPoints(card('5D'))).toBe(5);
    expect(cardPoints(card('9C'))).toBe(0);
  });
});

describe('bidding', () => {
  it('opens at the minimum and climbs in steps', () => {
    const state = createInitialTigdiState('TEST', names(5), { firstBidder: 0 });
    expect(minimumBid(state)).toBe(MIN_BID);
    expect(validateBid(state, 0, MIN_BID - BID_STEP).valid).toBe(false);
    expect(validateBid(state, 0, MIN_BID + 1).valid).toBe(false);
    expect(validateBid(state, 1, MIN_BID).valid).toBe(false);

    const opened = applyBid(state, 0, MIN_BID);
    expect(minimumBid(opened)).toBe(MIN_BID + BID_STEP);
    expect(opened.highBidder).toBe(0);
    expect(opened.currentTurn).toBe(1);
  });

  it('skips seats that have passed', () => {
    let state = createInitialTigdiState('TEST', names(5), { firstBidder: 0 });
    state = applyBid(state, 0, MIN_BID);
    state = applyBid(state, 1, null);
    expect(state.currentTurn).toBe(2);
    state = applyBid(state, 2, null);
    state = applyBid(state, 3, MIN_BID + BID_STEP);
    // Seat 4 next, then back round to 0 — 1 and 2 are out for good.
    expect(state.currentTurn).toBe(4);
    state = applyBid(state, 4, null);
    expect(state.currentTurn).toBe(0);
  });

  it('hands the contract to the last bidder standing', () => {
    let state = createInitialTigdiState('TEST', names(5), { firstBidder: 0 });
    state = applyBid(state, 0, 140);
    for (const seat of [1, 2, 3, 4]) state = applyBid(state, seat, null);
    expect(state.phase).toBe('CALLING');
    expect(state.highBidder).toBe(0);
    expect(state.highBid).toBe(140);
    expect(state.currentTurn).toBe(0);
  });

  it('passes the hand out when nobody bids', () => {
    let state = createInitialTigdiState('TEST', names(5), { firstBidder: 0 });
    for (const seat of [0, 1, 2, 3, 4]) state = applyBid(state, seat, null);
    expect(state.phase).toBe('PASSED_OUT');
  });
});

describe('the contract', () => {
  const won = () => {
    let state = createInitialTigdiState('TEST', names(7), { firstBidder: 0 });
    state = applyBid(state, 0, 150);
    for (const seat of [1, 2, 3, 4, 5, 6]) state = applyBid(state, seat, null);
    return state;
  };

  it('refuses a card the bidder is holding', () => {
    const state = won();
    const own = state.players[0].cards[0].code;
    const other = state.players[1].cards[0].code;
    expect(validateContract(state, 0, 'HEARTS', [own, other]).valid).toBe(false);
  });

  it('refuses a card that is not in this deal', () => {
    const state = won();
    const other = state.players[1].cards[0].code;
    // 2C is trimmed out of every supported deck size.
    expect(validateContract(state, 0, 'HEARTS', ['2C', other]).valid).toBe(false);
  });

  it('wants exactly as many calls as the table size asks for', () => {
    const state = won();
    const [a, b] = [state.players[1].cards[0].code, state.players[2].cards[0].code];
    expect(PARTNER_CALLS[7]).toBe(2);
    expect(validateContract(state, 0, 'HEARTS', [a]).valid).toBe(false);
    expect(validateContract(state, 0, 'HEARTS', [a, b]).valid).toBe(true);
  });

  it('puts the bidder and both called holders on one side', () => {
    const state = won();
    const a = state.players[3].cards[0].code;
    const b = state.players[5].cards[0].code;
    const playing = applyContract(state, 0, 'HEARTS', [a, b]);

    expect(playing.phase).toBe('PLAYING');
    expect(playing.currentTurn).toBe(0);
    const bidderSide = playing.players.filter((p) => p.team === 'BIDDER').map((p) => p.seat);
    expect(bidderSide).toEqual([0, 3, 5]);
    expect(playing.players.filter((p) => p.team === 'OPPONENT')).toHaveLength(4);
  });

  it('leaves the bidder a partner short when both calls land in one hand', () => {
    const state = won();
    const [a, b] = state.players[4].cards.slice(0, 2).map((c) => c.code);
    const playing = applyContract(state, 0, 'HEARTS', [a, b]);
    expect(playing.players.filter((p) => p.team === 'BIDDER').map((p) => p.seat)).toEqual([0, 4]);
  });
});

describe('tricks', () => {
  it('gives it to the highest trump, then the highest of the led suit', () => {
    const trick = [
      { seat: 0, card: card('AC') },
      { seat: 1, card: card('4C') },
      { seat: 2, card: card('2H') },
      { seat: 3, card: card('5H') },
      { seat: 4, card: card('KC') },
    ];
    expect(determineTrickWinner(trick, 'HEARTS')).toBe(3);
    expect(determineTrickWinner(trick, 'SPADES')).toBe(0);
    expect(determineTrickWinner(trick, null)).toBe(0);
  });

  it('makes you follow suit while you can', () => {
    const state = stateWithHands([
      ['AC', 'KH'], ['3C', 'QH'], ['4C', 'JH'], ['5C', '9H'], ['6C', '8H'],
    ]);
    const playing = applyContract({ ...state, phase: 'CALLING', highBidder: 0, highBid: 140 }, 0, 'HEARTS', ['QH']);
    const led = applyPlay(playing, 0, card('AC'));
    expect(validatePlay(led, 1, card('QH')).valid).toBe(false);
    expect(validatePlay(led, 1, card('3C')).valid).toBe(true);
  });

  it('lets a void hand play anything, trump included', () => {
    const state = stateWithHands([
      ['AC', 'KH'], ['QH', 'JH'], ['4C', '9H'], ['5C', '8H'], ['6C', '7H'],
    ]);
    const playing = applyContract({ ...state, phase: 'CALLING', highBidder: 0, highBid: 140 }, 0, 'HEARTS', ['QH']);
    const led = applyPlay(playing, 0, card('AC'));
    expect(validatePlay(led, 1, card('QH')).valid).toBe(true);
  });
});

describe('a whole hand', () => {
  /**
   * Five seats, two cards each, rigged so the bidder's side takes the trick
   * carrying the tigdi and the opponents take the other.
   */
  const rigged = () => {
    const state = stateWithHands([
      ['AS', '2S'],   // bidder
      ['KS', '3H'],   // holds the called KS
      ['QS', '4H'],
      ['JS', '5H'],
      ['3S', '6H'],
    ]);
    return applyContract(
      { ...state, phase: 'CALLING', highBidder: 0, highBid: 130 },
      0,
      'HEARTS',
      ['KS'],
    );
  };

  it('banks the trick points on the winner’s side and settles the bid', () => {
    let state = rigged();
    expect(state.players.map((p) => p.team)).toEqual([
      'BIDDER', 'BIDDER', 'OPPONENT', 'OPPONENT', 'OPPONENT',
    ]);

    // Trick one: bidder leads the ace of spades and takes A K Q J and the tigdi.
    for (const [seat, code] of [[0, 'AS'], [1, 'KS'], [2, 'QS'], [3, 'JS'], [4, '3S']] as const) {
      expect(validatePlay(state, seat, card(code)).valid).toBe(true);
      state = applyPlay(state, seat, card(code));
    }
    expect(state.lastTrick?.winner).toBe(0);
    expect(state.points.BIDDER).toBe(10 + 10 + 10 + 10 + 30);
    // Playing the called card named seat 1 as a partner.
    expect(state.revealed).toEqual({ KS: 1 });

    // Trick two: seat 0 is void in hearts, so 2S is legal and the hearts decide it.
    for (const [seat, code] of [[0, '2S'], [1, '3H'], [2, '4H'], [3, '5H'], [4, '6H']] as const) {
      state = applyPlay(state, seat, card(code));
    }
    expect(state.lastTrick?.winner).toBe(4);
    expect(state.points.OPPONENT).toBe(5);

    expect(state.phase).toBe('FINISHED');
    expect(state.result).toMatchObject({ bid: 130, made: false, winners: 'OPPONENT' });
  });

  it('calls it made when the bidder’s side reaches the bid', () => {
    let state = rigged();
    state.highBid = 65;
    state.result = undefined;
    for (const [seat, code] of [[0, 'AS'], [1, 'KS'], [2, 'QS'], [3, 'JS'], [4, '3S']] as const) {
      state = applyPlay(state, seat, card(code));
    }
    for (const [seat, code] of [[0, '2S'], [1, '3H'], [2, '4H'], [3, '5H'], [4, '6H']] as const) {
      state = applyPlay(state, seat, card(code));
    }
    expect(state.result).toMatchObject({ made: true, winners: 'BIDDER' });
    expect(state.points.BIDDER + state.points.OPPONENT).toBe(75);
  });
});

describe('what a seat can see', () => {
  it('hides other hands and unrevealed teams, and never hides your own', () => {
    const state = applyContract(
      { ...stateWithHands([['AS', '2S'], ['KS', '3H'], ['QS', '4H'], ['JS', '5H'], ['3S', '6H']]), phase: 'CALLING', highBidder: 0, highBid: 130 },
      0,
      'HEARTS',
      ['KS'],
    );

    const partner = viewFor(state, 1);
    expect(partner.players[1].cards?.map((c) => c.code)).toEqual(['KS', '3H']);
    expect(partner.players[2].cards).toBeNull();
    expect(partner.players[2].cardsLeft).toBe(2);
    // The partner knows their own side, and that the bidder is the bidder.
    expect(partner.players[1].team).toBe('BIDDER');
    expect(partner.players[0].team).toBe('BIDDER');
    // But seats 2, 3 and 4 are still unreadable to them.
    expect(partner.players.slice(2).map((p) => p.team)).toEqual([null, null, null]);

    // And the table cannot see who the partner is until the card is played.
    const opponent = viewFor(state, 2);
    expect(opponent.players[1].team).toBeNull();
    expect(opponent.players[1].cards).toBeNull();
  });

  it('names a partner once their called card is played', () => {
    let state = applyContract(
      { ...stateWithHands([['AS', '2S'], ['KS', '3H'], ['QS', '4H'], ['JS', '5H'], ['3S', '6H']]), phase: 'CALLING', highBidder: 0, highBid: 130 },
      0,
      'HEARTS',
      ['KS'],
    );
    state = applyPlay(state, 0, card('AS'));
    expect(viewFor(state, 2).players[1].team).toBeNull();
    state = applyPlay(state, 1, card('KS'));
    expect(viewFor(state, 2).players[1].team).toBe('BIDDER');
  });

  it('never shows a running team total, because it would name the trick winner', () => {
    let state = applyContract(
      { ...stateWithHands([['AS', '2S'], ['KS', '3H'], ['QS', '4H'], ['JS', '5H'], ['3S', '6H']]), phase: 'CALLING', highBidder: 0, highBid: 130 },
      0,
      'HEARTS',
      ['KS'],
    );
    for (const [seat, code] of [[0, 'AS'], [1, 'KS'], [2, 'QS'], [3, 'JS'], [4, '3S']] as const) {
      state = applyPlay(state, seat, card(code));
    }

    // The engine knows the sides took 70 and 0. Nobody may see that yet: the
    // jump alone would say which side the seat that won the trick is on.
    expect(state.points.BIDDER).toBe(70);
    for (const seat of [0, 1, 2, 3, 4]) {
      expect(viewFor(state, seat).points).toBeNull();
    }

    // What every seat captured is public — the whole table watched it happen.
    expect(viewFor(state, 3).pointsBySeat).toEqual([70, 0, 0, 0, 0]);
    expect(viewFor(state, 3).tricksBySeat).toEqual([1, 0, 0, 0, 0]);
  });

  it('gives up the team totals once the hand is over', () => {
    let state = applyContract(
      { ...stateWithHands([['AS', '2S'], ['KS', '3H'], ['QS', '4H'], ['JS', '5H'], ['3S', '6H']]), phase: 'CALLING', highBidder: 0, highBid: 130 },
      0,
      'HEARTS',
      ['KS'],
    );
    for (const [seat, code] of [[0, 'AS'], [1, 'KS'], [2, 'QS'], [3, 'JS'], [4, '3S']] as const) {
      state = applyPlay(state, seat, card(code));
    }
    for (const [seat, code] of [[0, '2S'], [1, '3H'], [2, '4H'], [3, '5H'], [4, '6H']] as const) {
      state = applyPlay(state, seat, card(code));
    }
    expect(viewFor(state, 2).points).toEqual({ BIDDER: 70, OPPONENT: 5 });
  });

  it('opens everything up once the hand is over', () => {
    let state = applyContract(
      { ...stateWithHands([['AS', '2S'], ['KS', '3H'], ['QS', '4H'], ['JS', '5H'], ['3S', '6H']]), phase: 'CALLING', highBidder: 0, highBid: 130 },
      0,
      'HEARTS',
      ['KS'],
    );
    for (const [seat, code] of [[0, 'AS'], [1, 'KS'], [2, 'QS'], [3, 'JS'], [4, '3S']] as const) {
      state = applyPlay(state, seat, card(code));
    }
    for (const [seat, code] of [[0, '2S'], [1, '3H'], [2, '4H'], [3, '5H'], [4, '6H']] as const) {
      state = applyPlay(state, seat, card(code));
    }
    expect(viewFor(state, 2).players.every((p) => p.team !== null)).toBe(true);
  });
});
