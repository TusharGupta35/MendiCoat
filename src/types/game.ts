export type SeatIndex = 0 | 1 | 2 | 3;

export type Suit = 'SPADES' | 'HEARTS' | 'CLUBS' | 'DIAMONDS';
export type TeamId = 'A' | 'B';

export interface Card {
  suit: Suit;
  rank: string;
  code: string;
}

export interface TrickPlay {
  seat: SeatIndex;
  card: Card;
}

export interface PlayerState {
  id: string;
  name: string;
  seat: SeatIndex;
  cards: Card[];
  team: TeamId;
}

export interface GameState {
  roomCode: string;
  status: 'LOBBY' | 'PLAYING' | 'FINISHED';
  currentTurn: SeatIndex;
  trumpSuit: Suit;
  trickNumber: number;
  trickCards: TrickPlay[];
  lastTrick?: { cards: TrickPlay[]; winner: SeatIndex };
  handsWon: Record<TeamId, number>;
  capturedTens: Record<TeamId, number>;
  capturedTensBySuit: Record<TeamId, Record<Suit, number>>;
  winnerTeam?: TeamId | 'DRAW';
  players: PlayerState[];
  deck: Card[];
}
