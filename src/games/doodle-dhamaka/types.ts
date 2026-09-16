/**
 * Doodle Dhamaka — someone draws, everyone guesses, and every round has a
 * surprise rule.
 *
 * Its state is its own, for the same reason Teen Ki Tigdi's is: nothing about
 * a drawing game fits a card game's shape. There are no seats and no hands;
 * there is a canvas, a secret answer, a feed of guesses, and a clock.
 */

export type DoodlePhase =
  /** The drawer is picking one of three prompts. Everyone else waits. */
  | 'CHOOSING'
  /** The drawer draws; everyone else guesses. */
  | 'DRAWING'
  /** The answer is out and the round's points are on screen. */
  | 'ROUND_END'
  /** Every round is played; the final leaderboard is up. */
  | 'GAME_OVER';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'dhamaka' | 'friends';

export interface Prompt {
  id: string;
  /** What the drawer is shown, and — for a single word — the answer itself. */
  text: string;
  category: string;
  emoji: string;
  difficulty: Difficulty;
  /** Other spellings that also count: "golgappa" for "pani puri". */
  aliases?: string[];
  /**
   * For a scene or combo prompt, the ideas a guess has to contain, each with
   * its accepted spellings. "Dog driving a car" is got by any guess naming a
   * dog and a car — nobody should have to type the sentence word for word.
   */
  keywords?: string[][];
}

export type DhamakaId =
  // Draw
  | 'one-stroke'
  | 'tiny-pen'
  | 'giant-pen'
  | 'one-color'
  | 'color-roulette'
  | 'no-eraser'
  | 'blind-artist'
  | 'mirror-artist'
  | 'opposite-hand'
  // Guess
  | 'no-chat'
  | 'chaos-chat'
  | 'one-guess'
  | 'hot-or-cold'
  // Time
  | 'panic'
  | 'bonus-time'
  | 'sudden-death'
  // Canvas
  | 'vanishing-lines'
  | 'flip'
  | 'fog';

export interface DoodlePlayer {
  id: string;
  name: string;
  score: number;
  /** Rounds in a row this player has guessed correctly. */
  streak: number;
}

/** One line of the canvas, in coordinates that are fractions of its size. */
export interface Stroke {
  id: string;
  tool: 'pen' | 'eraser';
  color: string;
  /** Brush width in thousandths of the canvas width, so it scales per screen. */
  size: number;
  /** [x, y] pairs, each from 0 to 1. */
  points: Array<[number, number]>;
  /** Server time the stroke began, so Vanishing Lines can fade it. */
  startedAt: number;
  done: boolean;
}

export type DrawOp =
  | { kind: 'start'; id: string; tool: 'pen' | 'eraser'; color: string; size: number; point: [number, number] }
  | { kind: 'points'; id: string; points: Array<[number, number]> }
  | { kind: 'end'; id: string }
  | { kind: 'undo' }
  | { kind: 'clear' };

/**
 * Who a feed line may be shown to.
 *
 * `all` is a wrong guess, which is fair game for the whole table. `solved` is
 * chat from someone who already knows the answer — the drawer, or anyone who
 * guessed it — and only goes to others who know it too, so nobody can talk the
 * answer into the open. `self` is shown to its author alone.
 */
export type FeedVisibility = 'all' | 'solved' | { self: string };

export interface FeedEntry {
  id: number;
  at: number;
  kind:
    | 'guess'
    | 'chat'
    | 'correct'
    | 'fake'
    | 'system'
    | 'lock-miss';
  playerId?: string;
  name?: string;
  text: string;
  visibility: FeedVisibility;
}

export interface GuessState {
  /** Server time of the correct guess, if there was one. */
  guessedAt?: number;
  wrong: number;
  used: number;
  lockUsed: boolean;
  /** Points already won this round, with the working shown. */
  points?: PointsBreakdown;
  /** Points lost to a Lock Guess that missed. */
  penalty?: number;
}

export interface PointsLine {
  label: string;
  /** Additive points, or a multiplier when `times` is set. */
  value: number;
  times?: boolean;
}

export interface PointsBreakdown {
  total: number;
  lines: PointsLine[];
}

export interface Award {
  emoji: string;
  title: string;
  playerId: string;
  detail?: string;
}

export interface RoundResult {
  number: number;
  drawerId: string;
  prompt: Pick<Prompt, 'text' | 'category' | 'emoji' | 'difficulty'>;
  dhamakas: DhamakaId[];
  outcome: 'perfect' | 'disaster' | 'normal';
  guessed: number;
  eligible: number;
  fastest?: { playerId: string; seconds: number };
  points: Record<string, PointsBreakdown>;
  /** What the drawer made this round, for Best Artist at the end. */
  drawerPoints: number;
  wrongGuesses: Record<string, number>;
  awards: Award[];
}

export interface Round {
  number: number;
  drawerId: string;
  dhamakas: DhamakaId[];
  /** A named combination, when the Dhamakas drawn happen to form one. */
  combo?: string;
  choices: Prompt[];
  prompt: Prompt | null;
  choosingEndsAt: number;
  startedAt?: number;
  /** The round's length before any Bonus Time was added. */
  duration: number;
  endsAt?: number;
  /** Players who were here to guess when the drawing started. */
  eligible: string[];
  guesses: Record<string, GuessState>;
  feed: FeedEntry[];
  strokes: Stroke[];
  /** The order letters are revealed in as hints, as indexes into the answer. */
  revealOrder: number[];
  /** Color Roulette's palette, in the order it cycles. */
  roulette?: string[];
  /** One Color's only color. */
  onlyColor?: string;
  nextFakeAt?: number;
  /** Once the canvas has been used under One Stroke, no second line. */
  strokeSpent?: boolean;
  result?: RoundResult;
  /** When a finished round hands over to the next. */
  nextAt?: number;
}

export interface FinalResult {
  standings: Array<{ playerId: string; name: string; score: number }>;
  awards: Award[];
}

export interface DoodleState {
  roomCode: string;
  phase: DoodlePhase;
  players: DoodlePlayer[];
  /** Who draws when, as player ids; one entry per round. */
  drawOrder: string[];
  /** How many Dhamakas each round gets, decided up front so it can be announced. */
  plan: number[];
  round: Round;
  history: RoundResult[];
  usedPromptIds: string[];
  friendPrompts: Prompt[];
  feedSeq: number;
  final?: FinalResult;
}

/** What one player is allowed to see, built fresh for them on every update. */
export interface DoodleView {
  roomCode: string;
  you: string | null;
  serverNow: number;
  phase: DoodlePhase;
  players: DoodlePlayer[];
  totalRounds: number;
  /** How many Dhamakas the *next* round gets, so the table can dread it. */
  nextDhamakaCount: number | null;
  /** Rounds until you draw, or null if you have drawn your last. */
  yourTurnIn: number | null;
  /** Who draws after this round, if anyone does. */
  nextDrawerId: string | null;
  history: RoundResult[];
  final?: FinalResult;
  round: {
    number: number;
    drawerId: string;
    dhamakas: DhamakaId[];
    combo?: string;
    /** Only the drawer, while choosing. */
    choices: Prompt[] | null;
    choosingEndsAt: number;
    startedAt?: number;
    endsAt?: number;
    duration: number;
    /** The answer, for the drawer, anyone who has guessed it, and after the round. */
    answer: Pick<Prompt, 'text' | 'category' | 'emoji' | 'difficulty'> | null;
    /** The masked answer everyone else sees, with whatever hints are out. */
    hint: HintView | null;
    suddenDeath: boolean;
    eligible: string[];
    /** Who has guessed it — public, since the table is told the moment it happens. */
    solvedBy: string[];
    feed: FeedEntry[];
    /** Your own guessing state this round. */
    yours: GuessState | null;
    roulette?: string[];
    onlyColor?: string;
    strokeSpent?: boolean;
    result?: RoundResult;
    nextAt?: number;
  };
}

export interface HintView {
  /** The answer as underscores and revealed letters, word breaks kept. */
  mask: string;
  letters: number;
  stage: number;
  category?: string;
  emoji?: string;
}
