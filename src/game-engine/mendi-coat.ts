import type { Card, GameState, SeatIndex, Suit } from '@/types/game';

const SUITS: Suit[] = ['SPADES', 'HEARTS', 'CLUBS', 'DIAMONDS'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUE: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };

function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank, code: `${rank}${suit[0]}` })));
}

function shuffleDeck(deck: Card[]): Card[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function dealCards(deck: Card[], playerCount: number): Card[][] {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  for (let i = 0; i < 52; i += 1) {
    hands[i % playerCount].push(deck[i]);
  }
  return hands;
}

export function createInitialGameState(roomCode: string, playerNames: string[]): GameState {
  const deck = shuffleDeck(createDeck());
  const dealt = dealCards(deck, 4);
  const players = playerNames.map((name, index) => ({
    id: `${index + 1}`,
    name,
    seat: index as SeatIndex,
    cards: dealt[index],
    // Seats 1 and 2 form Team A; Seats 3 and 4 form Team B.
    team: (index == 0 || index == 2 ? 'A' : 'B') as 'A' | 'B',
  }));

  return {
    roomCode,
    status: 'PLAYING',
    currentTurn: 0,
    trumpSuit: 'HEARTS',
    trickNumber: 1,
    trickCards: [],
    scores: { A: 0, B: 0 },
    capturedTens: { A: 0, B: 0 },
    capturedTensBySuit: {
      A: { SPADES: 0, HEARTS: 0, CLUBS: 0, DIAMONDS: 0 },
      B: { SPADES: 0, HEARTS: 0, CLUBS: 0, DIAMONDS: 0 },
    },
    players,
    deck: deck.slice(4),
  };
}

export function validateMove(gameState: GameState, seat: SeatIndex, card: Card): { valid: boolean; reason?: string } {
  const player = gameState.players.find((entry) => entry.seat === seat);
  if (!player) return { valid: false, reason: 'Unknown player' };
  if (seat !== gameState.currentTurn) return { valid: false, reason: 'Not your turn' };

  const hasCard = player.cards.some((entry) => entry.code === card.code);
  if (!hasCard) return { valid: false, reason: 'Card not in hand' };

  if (gameState.trickCards.length === 0) return { valid: true };

  const leadSuit = gameState.trickCards[0].card.suit;
  const followSuit = player.cards.filter((entry) => entry.suit === leadSuit);
  if (followSuit.length > 0 && card.suit !== leadSuit) {
    return { valid: false, reason: 'Must follow suit' };
  }

  return { valid: true };
}

export function applyMove(gameState: GameState, seat: SeatIndex, card: Card): GameState {
  const nextState = structuredClone(gameState);
  const player = nextState.players.find((entry) => entry.seat === seat);
  if (!player) return nextState;

  player.cards = player.cards.filter((entry) => entry.code !== card.code);
  nextState.trickCards.push({ seat, card });

  if (nextState.trickCards.length === 4) {
    const winnerSeat = determineTrickWinner(nextState);
    const completedTrick = [...nextState.trickCards];
    const winner = nextState.players.find((entry) => entry.seat === winnerSeat);
    if (!winner) return nextState;

    nextState.lastTrick = { cards: completedTrick, winner: winnerSeat };
    const capturedTens = completedTrick.filter((play) => play.card.rank === '10');
    nextState.capturedTens[winner.team] += capturedTens.length;
    for (const ten of capturedTens) {
      nextState.capturedTensBySuit[winner.team][ten.card.suit] += 1;
    }
    nextState.scores[winner.team] += 1;
    nextState.currentTurn = winnerSeat;
    nextState.trickCards = [];
    nextState.trickNumber += 1;

    if (nextState.trickNumber > 13) {
      nextState.status = 'FINISHED';
      nextState.winnerTeam = nextState.capturedTens.A === nextState.capturedTens.B
        ? 'DRAW'
        : nextState.capturedTens.A > nextState.capturedTens.B ? 'A' : 'B';
    }
  } else {
    nextState.currentTurn = ((seat + 1) % 4) as SeatIndex;
  }

  return nextState;
}

export function determineTrickWinner(gameState: GameState): SeatIndex {
  const leadSuit = gameState.trickCards[0].card.suit;
  const trumpSuit = gameState.trumpSuit;
  const winning = gameState.trickCards.reduce((best, play) => {
    const candidate = play.card;
    const bestCard = best.card;
    const candidateIsTrump = candidate.suit === trumpSuit;
    const bestIsTrump = bestCard.suit === trumpSuit;

    if (candidateIsTrump !== bestIsTrump) return candidateIsTrump ? play : best;
    if (candidateIsTrump && RANK_VALUE[candidate.rank] > RANK_VALUE[bestCard.rank]) return play;
    if (!candidateIsTrump && candidate.suit === leadSuit && bestCard.suit !== leadSuit) return play;
    if (candidate.suit === leadSuit && bestCard.suit === leadSuit && RANK_VALUE[candidate.rank] > RANK_VALUE[bestCard.rank]) return play;
    return best;
  });

  return winning.seat;
}
