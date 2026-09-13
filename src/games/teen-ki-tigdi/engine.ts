import type {
  Card,
  Suit,
  TigdiPlayer,
  TigdiSeat,
  TigdiState,
  TigdiTeam,
  TigdiView,
} from '@/games/teen-ki-tigdi/types';

/**
 * Teen Ki Tigdi.
 *
 * A hand runs in three acts, and the engine is organised the same way: everyone
 * bids for the right to name the contract, the winner names trump and calls the
 * cards that pick their partners out of the table, then the whole table plays
 * tricks for the 250 points in the deck. The bidder's side needs to capture at
 * least what it bid.
 *
 * The one thing worth holding on to while reading this: whose team is whose is
 * *known to the engine* from the moment partners are called, and hidden from
 * the players until the called cards turn up. Secrecy is a view concern, not a
 * rules concern — see `viewFor`.
 */

const SUITS: Suit[] = ['SPADES', 'HEARTS', 'CLUBS', 'DIAMONDS'];
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

/** Ace high, 2 low — trick strength only. What a card is worth is separate. */
export const RANK_VALUE: Record<string, number> = {
  A: 14, K: 13, Q: 12, J: 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
};

/** The 30-point card the game is named for. */
export const TIGDI = '3S';

/** Every point in the deck, and there are exactly 250 of them. */
export const TOTAL_POINTS = 250;

export function cardPoints(card: Card): number {
  if (card.code === TIGDI) return 30;
  if (card.rank === 'A' || card.rank === 'K' || card.rank === 'Q' || card.rank === 'J' || card.rank === '10') return 10;
  if (card.rank === '5') return 5;
  return 0;
}

export const SUPPORTED_PLAYER_COUNTS = [5, 6, 7] as const;
export type TigdiPlayerCount = (typeof SUPPORTED_PLAYER_COUNTS)[number];

/**
 * How the deck is trimmed so it deals out evenly.
 *
 * Only 2s are ever taken out, and never the 3♠ — every point in the game has to
 * stay on the table or the totals stop adding to 250. Four 2s is the most any
 * table needs, so no other rank is ever touched.
 */
const REMOVED: Record<TigdiPlayerCount, string[]> = {
  5: ['2C', '2D'],
  6: ['2C', '2D', '2H', '2S'],
  7: ['2C', '2D', '2H'],
};

export const CARDS_PER_PLAYER: Record<TigdiPlayerCount, number> = { 5: 10, 6: 8, 7: 7 };

/**
 * How many cards the bidder calls to name partners, and so how the table splits.
 *
 * Five plays 2 against 3, six plays 3 against 3, seven plays 3 against 4. The
 * bidder is always outnumbered or level, never ahead — that is what makes a big
 * bid a gamble rather than an announcement.
 */
export const PARTNER_CALLS: Record<TigdiPlayerCount, number> = { 5: 1, 6: 2, 7: 2 };

/** The lowest anyone may open at, and the step between bids. */
export const MIN_BID = 130;
export const BID_STEP = 5;
export const MAX_BID = TOTAL_POINTS;

export function isSupportedCount(count: number): count is TigdiPlayerCount {
  return (SUPPORTED_PLAYER_COUNTS as readonly number[]).includes(count);
}

export function buildDeck(playerCount: TigdiPlayerCount): Card[] {
  const removed = new Set(REMOVED[playerCount]);
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({ suit, rank, code: `${rank}${suit[0]}` })),
  ).filter((card) => !removed.has(card.code));
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((left, right) => {
    const bySuit = SUITS.indexOf(left.suit) - SUITS.indexOf(right.suit);
    return bySuit || RANK_VALUE[right.rank] - RANK_VALUE[left.rank];
  });
}

export function createInitialTigdiState(
  roomCode: string,
  playerNames: string[],
  options: { firstBidder?: TigdiSeat } = {},
): TigdiState {
  const playerCount = playerNames.length;
  if (!isSupportedCount(playerCount)) {
    throw new Error(`Teen Ki Tigdi needs 5, 6 or 7 players — got ${playerCount}.`);
  }

  const deck = shuffle(buildDeck(playerCount));
  const perPlayer = CARDS_PER_PLAYER[playerCount];
  const players: TigdiPlayer[] = playerNames.map((name, seat) => ({
    seat,
    name,
    cards: sortHand(deck.slice(seat * perPlayer, (seat + 1) * perPlayer)),
    team: null,
    bid: null,
    passed: false,
  }));

  return {
    roomCode,
    playerCount,
    phase: 'BIDDING',
    players,
    currentTurn: options.firstBidder ?? Math.floor(Math.random() * playerCount),
    highBid: null,
    highBidder: null,
    bidLog: [],
    trumpSuit: null,
    calledCards: [],
    revealed: {},
    trickNumber: 1,
    trickCards: [],
    points: { BIDDER: 0, OPPONENT: 0 },
    pointsBySeat: playerNames.map(() => 0),
    tricksBySeat: playerNames.map(() => 0),
  };
}

// ── Bidding ─────────────────────────────────────────────────────────────────

/** The next seat still in the bidding, wrapping around the table. */
function nextActiveBidder(state: TigdiState, from: TigdiSeat): TigdiSeat | null {
  for (let step = 1; step <= state.playerCount; step += 1) {
    const seat = (from + step) % state.playerCount;
    if (!state.players[seat].passed) return seat;
  }
  return null;
}

/**
 * The smallest bid that would be legal right now. Takes only the standing bid,
 * so the browser can ask it of a redacted view as easily as the server can ask
 * it of the real state.
 */
export function minimumBid(hand: { highBid: number | null }): number {
  return hand.highBid === null ? MIN_BID : hand.highBid + BID_STEP;
}

export function validateBid(
  state: TigdiState,
  seat: TigdiSeat,
  amount: number | null,
): { valid: boolean; reason?: string } {
  if (state.phase !== 'BIDDING') return { valid: false, reason: 'Bidding is over.' };
  if (seat !== state.currentTurn) return { valid: false, reason: 'Not your turn to bid.' };
  if (state.players[seat]?.passed) return { valid: false, reason: 'You have already passed.' };
  if (amount === null) return { valid: true };

  const floor = minimumBid(state);
  if (!Number.isInteger(amount) || amount % BID_STEP !== 0) {
    return { valid: false, reason: `Bid in steps of ${BID_STEP}.` };
  }
  if (amount < floor) return { valid: false, reason: `The bid is at least ${floor}.` };
  if (amount > MAX_BID) return { valid: false, reason: `${MAX_BID} is every point in the deck.` };
  return { valid: true };
}

/**
 * Records a bid, or a pass when `amount` is null.
 *
 * Bidding closes as soon as only one seat is left in it. If that seat is the
 * one holding the high bid, they have won the contract; if nobody ever bid at
 * all, the hand is dead and the table deals again.
 */
export function applyBid(state: TigdiState, seat: TigdiSeat, amount: number | null): TigdiState {
  const next = structuredClone(state);
  const player = next.players[seat];
  next.bidLog.push({ seat, amount });

  if (amount === null) {
    player.passed = true;
  } else {
    player.bid = amount;
    next.highBid = amount;
    next.highBidder = seat;
  }

  const remaining = next.players.filter((entry) => !entry.passed);
  if (remaining.length <= 1) {
    if (next.highBidder === null) {
      // Nobody wanted it. There is no contract to play for, so the hand ends
      // here and the room deals a fresh one.
      next.phase = 'PASSED_OUT';
      return next;
    }
    next.phase = 'CALLING';
    next.currentTurn = next.highBidder;
    return next;
  }

  const following = nextActiveBidder(next, seat);
  if (following === null) {
    next.phase = 'PASSED_OUT';
    return next;
  }
  next.currentTurn = following;
  return next;
}

// ── The contract ────────────────────────────────────────────────────────────

/** Every card still in the deck for this hand, as codes. */
export function cardsInPlay(state: TigdiState): Set<string> {
  return new Set(state.players.flatMap((player) => player.cards.map((card) => card.code)));
}

export function validateContract(
  state: TigdiState,
  seat: TigdiSeat,
  trumpSuit: Suit,
  calledCards: string[],
): { valid: boolean; reason?: string } {
  if (state.phase !== 'CALLING') return { valid: false, reason: 'It is not time to name the contract.' };
  if (seat !== state.highBidder) return { valid: false, reason: 'Only the bidder names the contract.' };
  if (!SUITS.includes(trumpSuit)) return { valid: false, reason: 'Pick one of the four suits as trump.' };

  const required = PARTNER_CALLS[state.playerCount as TigdiPlayerCount];
  if (calledCards.length !== required) {
    return { valid: false, reason: `Call ${required} card${required === 1 ? '' : 's'} to name your partners.` };
  }
  if (new Set(calledCards).size !== calledCards.length) {
    return { valid: false, reason: 'Call two different cards.' };
  }

  const inPlay = cardsInPlay(state);
  const own = new Set(state.players[seat].cards.map((card) => card.code));
  for (const code of calledCards) {
    if (!inPlay.has(code)) return { valid: false, reason: `${code} is not in this deal.` };
    // Calling your own card would hand you a partner who is you, and quietly
    // shrink your side by one.
    if (own.has(code)) return { valid: false, reason: 'You cannot call a card you are holding.' };
  }
  return { valid: true };
}

/**
 * Locks in trump and the called cards, and settles the teams.
 *
 * Two called cards can land in the same hand. That is left alone rather than
 * re-dealt: the bidder gambled and came up a partner short, and finding that
 * out the hard way is part of the game.
 */
export function applyContract(
  state: TigdiState,
  seat: TigdiSeat,
  trumpSuit: Suit,
  calledCards: string[],
): TigdiState {
  const next = structuredClone(state);
  next.trumpSuit = trumpSuit;
  next.calledCards = [...calledCards];

  const called = new Set(calledCards);
  for (const player of next.players) {
    const holdsCalled = player.cards.some((card) => called.has(card.code));
    player.team = player.seat === seat || holdsCalled ? 'BIDDER' : 'OPPONENT';
  }

  next.phase = 'PLAYING';
  // The bidder leads: they bought the right to set the hand going.
  next.currentTurn = seat;
  return next;
}

// ── Play ────────────────────────────────────────────────────────────────────

export function validatePlay(
  state: TigdiState,
  seat: TigdiSeat,
  card: Card,
): { valid: boolean; reason?: string } {
  if (state.phase !== 'PLAYING') return { valid: false, reason: 'The hand is not in play.' };
  if (seat !== state.currentTurn) return { valid: false, reason: 'Not your turn.' };

  const player = state.players[seat];
  if (!player) return { valid: false, reason: 'Unknown player.' };
  if (!player.cards.some((entry) => entry.code === card.code)) {
    return { valid: false, reason: 'Card not in hand.' };
  }
  if (state.trickCards.length === 0) return { valid: true };

  const leadSuit = state.trickCards[0].card.suit;
  const canFollow = player.cards.some((entry) => entry.suit === leadSuit);
  if (canFollow && card.suit !== leadSuit) return { valid: false, reason: 'Must follow suit.' };
  return { valid: true };
}

/** Highest trump takes it; failing that, highest card of the led suit. */
export function determineTrickWinner(
  trick: { seat: TigdiSeat; card: Card }[],
  trumpSuit: Suit | null,
): TigdiSeat {
  const leadSuit = trick[0].card.suit;
  const best = trick.reduce((winner, play) => {
    const candidateTrump = trumpSuit !== null && play.card.suit === trumpSuit;
    const winnerTrump = trumpSuit !== null && winner.card.suit === trumpSuit;
    if (candidateTrump !== winnerTrump) return candidateTrump ? play : winner;
    if (candidateTrump) {
      return RANK_VALUE[play.card.rank] > RANK_VALUE[winner.card.rank] ? play : winner;
    }
    if (play.card.suit !== leadSuit) return winner;
    if (winner.card.suit !== leadSuit) return play;
    return RANK_VALUE[play.card.rank] > RANK_VALUE[winner.card.rank] ? play : winner;
  });
  return best.seat;
}

export function trickPoints(trick: { card: Card }[]): number {
  return trick.reduce((total, play) => total + cardPoints(play.card), 0);
}

export function applyPlay(state: TigdiState, seat: TigdiSeat, card: Card): TigdiState {
  const next = structuredClone(state);
  const player = next.players[seat];
  player.cards = player.cards.filter((entry) => entry.code !== card.code);
  next.trickCards.push({ seat, card });

  // A called card on the table names its holder out loud. This is the only way
  // a partner is ever revealed, so it is the whole deduction game in one line.
  if (next.calledCards.includes(card.code)) next.revealed[card.code] = seat;

  if (next.trickCards.length < next.playerCount) {
    next.currentTurn = (seat + 1) % next.playerCount;
    return next;
  }

  const completed = [...next.trickCards];
  const winnerSeat = determineTrickWinner(completed, next.trumpSuit);
  const winner = next.players[winnerSeat];
  next.lastTrick = { cards: completed, winner: winnerSeat };
  next.tricksBySeat[winnerSeat] += 1;
  const taken = trickPoints(completed);
  next.pointsBySeat[winnerSeat] += taken;
  if (winner.team) next.points[winner.team] += taken;
  next.trickCards = [];
  next.trickNumber += 1;
  next.currentTurn = winnerSeat;

  if (next.players.every((entry) => entry.cards.length === 0)) {
    next.phase = 'FINISHED';
    const bid = next.highBid!;
    const made = next.points.BIDDER >= bid;
    next.result = {
      bid,
      bidderSeat: next.highBidder!,
      trumpSuit: next.trumpSuit!,
      calledCards: [...next.calledCards],
      points: { ...next.points },
      made,
      winners: made ? 'BIDDER' : 'OPPONENT',
    };
  }

  return next;
}

// ── What each seat gets to see ──────────────────────────────────────────────

/**
 * Whether a seat's team is public yet.
 *
 * A seat is exposed once one of the called cards has been played from it, and
 * the bidder is exposed from the moment they win the auction — everyone watched
 * them do it. Everybody else stays unreadable until their card turns up, which
 * is the point.
 */
function isTeamPublic(state: TigdiState, seat: TigdiSeat): boolean {
  if (state.phase === 'FINISHED') return true;
  if (seat === state.highBidder) return true;
  return Object.values(state.revealed).includes(seat);
}

/**
 * The state as one seat is allowed to see it: their own cards, everyone else's
 * card *count*, and only the teams that have already given themselves away.
 *
 * Pass `null` for a spectator.
 */
export function viewFor(state: TigdiState, seat: TigdiSeat | null): TigdiView {
  const { players, points, ...rest } = structuredClone(state);
  return {
    ...rest,
    you: seat,
    // Held back until the hand is over. A running team total names whoever just
    // won a trick, which would give the hidden partners away immediately — see
    // the note on TigdiView.points. What each seat has captured goes out in
    // full, because the whole table watched them capture it.
    points: state.phase === 'FINISHED' ? points : null,
    players: players.map((player) => ({
      seat: player.seat,
      name: player.name,
      bid: player.bid,
      passed: player.passed,
      cards: player.seat === seat ? player.cards : null,
      cardsLeft: player.cards.length,
      // Your own team is yours to know the moment it is decided — that is how
      // a called partner finds out they are one.
      team: player.seat === seat || isTeamPublic(state, player.seat) ? player.team : null,
    })),
  };
}
