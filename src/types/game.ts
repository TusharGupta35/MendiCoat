export type SeatIndex = 0 | 1 | 2 | 3;

export type Suit = 'SPADES' | 'HEARTS' | 'CLUBS' | 'DIAMONDS';

export interface Card {
  suit: Suit;
  rank: string;
  code: string;
}

export interface PlayerState {
  id: string;
  name: string;
  seat: SeatIndex;
  cards: Card[];
  team: 'A' | 'B';
}

export interface GameState {
  roomCode: string;
  status: 'LOBBY' | 'PLAYING' | 'FINISHED';
  currentTurn: SeatIndex;
  trumpSuit: Suit;
  trickNumber: number;
  trickCards: Card[];
  scores: { A: number; B: number };
  capturedTens: { A: number; B: number };
  players: PlayerState[];
  deck: Card[];
}
