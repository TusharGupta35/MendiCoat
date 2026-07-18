import type { Card, GameState, SeatIndex, Suit } from '@/types/game';

const SUITS: Suit[] = ['SPADES', 'HEARTS', 'CLUBS', 'DIAMONDS'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

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
    team: (index % 2 === 0 ? 'A' : 'B') as 'A' | 'B',
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

  const leadSuit = gameState.trickCards[0].suit;
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
  nextState.trickCards.push(card);

  if (nextState.trickCards.length === 4) {
    const winnerSeat = determineTrickWinner(nextState);
    nextState.currentTurn = winnerSeat;
    nextState.trickCards = [];
    nextState.trickNumber += 1;
    nextState.scores.A += 1;
  } else {
    nextState.currentTurn = ((seat + 1) % 4) as SeatIndex;
  }

  return nextState;
}

export function determineTrickWinner(gameState: GameState): SeatIndex {
  const leadSuit = gameState.trickCards[0].suit;
  const trumpSuit = gameState.trumpSuit;
  const winning = gameState.trickCards.reduce((best, card, index) => {
    const currentSeat = (gameState.currentTurn + index) as SeatIndex;
    const bestCard = gameState.trickCards[best.index];
    const isTrump = card.suit === trumpSuit;
    const isBestTrump = bestCard.suit === trumpSuit;
    if (isTrump && !isBestTrump) return { index, seat: currentSeat };
    if (!isTrump && isBestTrump) return best;
    if (card.suit === leadSuit && bestCard.suit !== leadSuit) return { index, seat: currentSeat };
    return best;
  }, { index: 0, seat: gameState.currentTurn });

  return winning.seat;
}
