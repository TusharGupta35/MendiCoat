/**
 * Impostor — everyone answers the same question except one person, who never
 * saw it.
 *
 * Its state is its own, like Doodle Dhamaka's, because nothing here fits a card
 * game's shape: there are no seats and no hands. There is a question most of
 * the table can see, a list of answers, an argument, and a vote.
 *
 * The one rule that governs every type below: the question is a secret, so the
 * server never puts it in a payload that reaches someone who is not allowed to
 * know it. That is why `ImpostorView` exists separately from `ImpostorState` —
 * the state holds the truth, the view holds one player's share of it.
 */

export type ImpostorPhase =
  /** Roles are out. Everyone is reading their own card and nobody else's. */
  | 'ROLE'
  /** One player at a time answers; everyone watches the answers land. */
  | 'ANSWER'
  /** Open discussion. The actual game. */
  | 'DISCUSS'
  /** Safai only: the two most-suspected each get the floor, uninterrupted. */
  | 'DEFENCE'
  /** Everyone picks who they think never saw the question. */
  | 'VOTE'
  /** Votes and roles are out in the open. */
  | 'REVEAL'
  /** A caught impostor picks the real question out of three. */
  | 'STEAL'
  /** The round's points, with the working shown. */
  | 'ROUND_END'
  /** Every round is played; the leaderboard is up. */
  | 'GAME_OVER';

export type Category = 'funny' | 'hot-take' | 'personal' | 'opinion' | 'people' | 'number' | 'friends';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'friends';

/**
 * What kind of answer a question wants.
 *
 * This is the part the impostor *is* told, and the whole game depends on it
 * being told honestly. Without it they answer in the wrong shape and get caught
 * for typing a word where everyone else typed a number — which is no fun for
 * anybody. With it, the only thing they are missing is the content, which is
 * exactly the thing worth missing.
 */
export type AnswerKind =
  /** A name from this table, so it is picked rather than typed. */
  | 'player'
  /** A number in a range. */
  | 'number'
  /** Free text, short. */
  | 'text';

export interface AnswerFormat {
  kind: AnswerKind;
  /** Shown to the impostor, and to everyone as a reminder. "One food item." */
  label: string;
  /** For `number`. Inclusive. */
  min?: number;
  max?: number;
  /** For `text`: a nudge in the box, never a hint at the question. */
  placeholder?: string;
}

export interface Question {
  id: string;
  text: string;
  category: Category;
  emoji: string;
  difficulty: Difficulty;
  format: AnswerFormat;
}

export type ChaalId =
  | 'do-chor'
  | 'ek-lafaz'
  | 'chup'
  | 'safai'
  | 'khulla-vote'
  | 'sab-saaf';

export interface ImpostorPlayer {
  id: string;
  name: string;
  score: number;
  /** Rounds in a row this player has named the impostor, for Lie Detector. */
  streak: number;
}

export interface Answer {
  playerId: string;
  text: string;
  /** Server time it landed, so the table can see who agonised over it. */
  at: number;
  /** Nobody answered in time and the game moved on. */
  timedOut?: boolean;
}

/** A player's non-binding "this one smells" tap during discussion. */
export type Suspicion = Record<string, string>;

/** `null` is a NOBODY vote, which only a Sab Saaf round allows. */
export type Vote = Record<string, string | null>;

export interface PointsLine {
  label: string;
  value: number;
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
  question: Pick<Question, 'text' | 'category' | 'emoji' | 'difficulty'>;
  chaal: ChaalId | null;
  impostorIds: string[];
  answers: Answer[];
  votes: Vote;
  /** Impostors who finished on the most votes. */
  caughtIds: string[];
  /** Impostors who then named the real question out of three. */
  stoleIds: string[];
  /** Who the table piled on, impostor or not — for the end-of-match awards. */
  mostVotedId: string | null;
  points: Record<string, PointsBreakdown>;
}

export interface Round {
  number: number;
  question: Question;
  chaal: ChaalId | null;
  impostorIds: string[];
  /** Randomised every round: answering first is hard, answering last is not. */
  order: string[];
  /** How far through `order` we are. */
  turn: number;
  answers: Answer[];
  suspicion: Suspicion;
  votes: Vote;
  /** Safai's two defendants, in the order they get the floor. */
  defendants: string[];
  defenceTurn: number;
  /** The three questions a caught impostor picks from, the real one among them. */
  stealChoices: Question[];
  /** What each caught impostor picked. */
  stealPicks: Record<string, string>;
  /** Nothing decides the match, so this round has no chaal and no steal-back. */
  suddenDeath: boolean;
  /** When the current phase runs out. */
  endsAt: number;
  result?: RoundResult;
}

export interface FinalResult {
  standings: Array<{ playerId: string; name: string; score: number }>;
  awards: Award[];
  /** A tie at the top that a Sudden Death round could not break. */
  shared: boolean;
}

export type Mode = 'classic' | 'friends' | 'chaos' | 'quick';

export interface ImpostorState {
  roomCode: string;
  phase: ImpostorPhase;
  mode: Mode;
  players: ImpostorPlayer[];
  /** One round per player, plus a Sudden Death round if the top is tied. */
  totalRounds: number;
  round: Round;
  history: RoundResult[];
  usedQuestionIds: string[];
  friendQuestions: Question[];
  usedChaals: ChaalId[];
  final?: FinalResult;
}

/**
 * One player's share of the truth, rebuilt for them on every update.
 *
 * `question` is null for an impostor until the round is over — that single null
 * is the entire game, so it is worth saying plainly: if this field is ever
 * populated for someone who should not have it, Impostor is broken.
 */
export interface ImpostorView {
  roomCode: string;
  you: string | null;
  serverNow: number;
  phase: ImpostorPhase;
  mode: Mode;
  players: ImpostorPlayer[];
  totalRounds: number;
  history: RoundResult[];
  final?: FinalResult;
  round: {
    number: number;
    /** The real question — crew always, impostors only once it is revealed. */
    question: Pick<Question, 'text' | 'category' | 'emoji' | 'difficulty'> | null;
    /** What shape the answer takes. Everyone sees this, impostors included. */
    format: AnswerFormat;
    chaal: ChaalId | null;
    suddenDeath: boolean;
    /** Are *you* the impostor? Never says anything about anyone else. */
    youAreImpostor: boolean;
    /** Who was lying — only after the reveal. */
    impostorIds: string[] | null;
    order: string[];
    /** Whose turn it is to answer, or null outside the answer phase. */
    answeringId: string | null;
    answers: Answer[];
    /** Live counts during discussion; who tapped whom stays private. */
    suspicion: Record<string, number>;
    /** Your own tap, so your page can show it selected. */
    yourSuspicion: string | null;
    defendants: string[];
    defendingId: string | null;
    /** Hidden until everyone has voted — unless the Chaal is Khulla Vote. */
    votes: Vote | null;
    /** Who has voted, which is public even when the votes are not. */
    voted: string[];
    yourVote: string | null | undefined;
    /** Only a caught impostor is sent these, and only during the steal. */
    stealChoices: Array<Pick<Question, 'id' | 'text'>> | null;
    /** Caught impostors, so the table knows who is deciding. */
    stealingIds: string[];
    endsAt: number;
    result?: RoundResult;
  };
}
