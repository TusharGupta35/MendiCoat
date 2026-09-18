import {
  PALETTE,
  brushesFor,
  comboFor,
  dhamakaMultiplier,
  hasDhamaka,
  pickDhamakas,
  planDhamakas,
} from './dhamakas';
import { isCorrect, revealsAnswer, similarity, compact, warmth, type Warmth } from './match';
import type {
  Award,
  DoodlePlayer,
  DoodleState,
  DoodleView,
  DrawOp,
  FeedEntry,
  FeedVisibility,
  GuessState,
  HintView,
  PointsBreakdown,
  PointsLine,
  Prompt,
  Round,
  RoundResult,
} from './types';
import { DIFFICULTY_LABEL, DIFFICULTY_MULTIPLIER, WORDS, wordsFor } from './words';

/**
 * Doodle Dhamaka's rules.
 *
 * Unlike the card games, these functions change the state they are handed
 * rather than returning a copy. A round's canvas holds every point of every
 * line, and the drawer sends a batch of points many times a second; copying all
 * of it on every batch would be work spent on nothing, since the server keeps
 * exactly one state per room and nobody else holds a reference to it.
 *
 * Time is always passed in, never read from the clock, so every rule here can
 * be tested at any moment of a round without waiting for it.
 */

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;

export const ROUND_MS = 80_000;
export const PANIC_MS = 30_000;
export const CHOOSE_MS = 15_000;
export const RESULT_MS = 8_000;
export const BONUS_TIME_MS = 5_000;
/** However many people get it, Bonus Time never stretches a round past this. */
export const BONUS_TIME_CAP_MS = 25_000;
/** How far into the round Sudden Death stops the hints. */
export const SUDDEN_DEATH_AT = 0.7;

const FEED_LIMIT = 80;
const MAX_STROKES = 1500;
const MAX_POINTS_PER_STROKE = 4000;
const MAX_POINTS_PER_OP = 300;

/**
 * Points for a correct guess by how early it came, as a share of the round.
 * In an 80-second round these are the spec's brackets: inside 10 seconds, 25,
 * 45, 65, and after.
 */
const SPEED_BRACKETS: Array<[upTo: number, points: number]> = [
  [0.125, 500],
  [0.31, 400],
  [0.56, 300],
  [0.81, 200],
  [Infinity, 100],
];

/** When each hint arrives, as a share of the round, and what it costs. */
const HINT_AT = [0, 0.35, 0.55, 0.75];
const HINT_FACTOR = [1, 0.85, 0.7, 0.55];

const DRAWER_BASE = 300;
const PERFECT_DRAWER_BONUS = 150;
const PERFECT_GUESSER_BONUS = 50;
const LOCK_PENALTY = 50;

export type Result = { ok: true } | { ok: false; reason: string };
const refuse = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };

// ── Setting up ──────────────────────────────────────────────────────────────

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const pick = <T>(items: T[], rng: () => number): T => items[Math.floor(rng() * items.length)];

/** Everyone draws twice at a small table, once at a big one. */
export const turnsPerPlayer = (count: number) => (count <= 6 ? 2 : 1);

export function friendPrompt(text: string, index: number): Prompt {
  return {
    id: `friend:${index}`,
    text: text.trim(),
    category: 'Friends',
    emoji: '🫂',
    difficulty: 'friends',
  };
}

export function createGame({
  roomCode,
  players,
  friendWords = [],
  now,
  rng = Math.random,
}: {
  roomCode: string;
  players: Array<{ id: string; name: string }>;
  friendWords?: string[];
  now: number;
  rng?: () => number;
}): DoodleState {
  // Shuffled once, then repeated: the same order each lap means nobody draws
  // twice before everyone has drawn once.
  const order = shuffle(players.map((player) => player.id), rng);
  const drawOrder = Array.from({ length: turnsPerPlayer(players.length) }, () => order).flat();

  const state: DoodleState = {
    roomCode,
    phase: 'CHOOSING',
    players: players.map((player) => ({ id: player.id, name: player.name, score: 0, streak: 0 })),
    drawOrder,
    plan: planDhamakas(drawOrder.length),
    round: emptyRound(),
    history: [],
    usedPromptIds: [],
    friendPrompts: friendWords.map(friendPrompt),
    feedSeq: 0,
  };
  beginRound(state, 0, now, rng);
  return state;
}

function emptyRound(): Round {
  return {
    number: 0,
    drawerId: '',
    dhamakas: [],
    choices: [],
    prompt: null,
    choosingEndsAt: 0,
    duration: ROUND_MS,
    eligible: [],
    guesses: {},
    feed: [],
    strokes: [],
    revealOrder: [],
  };
}

/** A late arrival guesses from the next moment on; they are not in the draw order. */
export function addPlayer(state: DoodleState, player: { id: string; name: string }) {
  if (state.players.some((entry) => entry.id === player.id)) return;
  state.players.push({ id: player.id, name: player.name, score: 0, streak: 0 });
}

/**
 * Three choices: one easy, one medium, and one wild — a friend's word when the
 * group has written some, otherwise a hard word or a full scene.
 */
function chooseOptions(state: DoodleState, rng: () => number): Prompt[] {
  const unused = (pool: Prompt[]) => {
    const fresh = pool.filter((prompt) => !state.usedPromptIds.includes(prompt.id));
    // A long game can run a tier dry; repeating beats offering nothing.
    return fresh.length > 0 ? fresh : pool;
  };

  const easy = pick(unused(wordsFor('easy')), rng);
  const medium = pick(unused(wordsFor('medium')), rng);
  const friends = state.friendPrompts.filter((prompt) => !state.usedPromptIds.includes(prompt.id));
  const wild =
    friends.length > 0 && rng() < 0.5
      ? pick(friends, rng)
      : pick(unused(wordsFor(rng() < 0.5 ? 'hard' : 'dhamaka')), rng);
  return [easy, medium, wild];
}

function beginRound(
  state: DoodleState,
  index: number,
  now: number,
  rng: () => number,
  active?: Set<string>,
) {
  // Someone who has left does not hold the game up: their turn is skipped.
  let turn = index;
  while (turn < state.drawOrder.length && active && !active.has(state.drawOrder[turn])) turn += 1;
  if (turn >= state.drawOrder.length) {
    finishGame(state);
    return;
  }

  const dhamakas = pickDhamakas(state.plan[turn] ?? 1, rng);
  const inks = PALETTE.filter((color) => color !== '#ffffff');
  state.round = {
    ...emptyRound(),
    number: turn + 1,
    drawerId: state.drawOrder[turn],
    dhamakas,
    combo: comboFor(dhamakas),
    choices: chooseOptions(state, rng),
    choosingEndsAt: now + CHOOSE_MS,
    duration: hasDhamaka(dhamakas, 'panic') ? PANIC_MS : ROUND_MS,
    ...(hasDhamaka(dhamakas, 'color-roulette') ? { roulette: shuffle(inks, rng) } : {}),
    ...(hasDhamaka(dhamakas, 'one-color') ? { onlyColor: pick(inks, rng) } : {}),
  };
  state.phase = 'CHOOSING';
}

// ── Choosing ────────────────────────────────────────────────────────────────

export function choosePrompt(
  state: DoodleState,
  playerId: string,
  promptId: string,
  now: number,
  rng: () => number = Math.random,
  active?: Set<string>,
): Result {
  if (state.phase !== 'CHOOSING') return refuse('It is not time to choose a word.');
  if (state.round.drawerId !== playerId) return refuse('Only the drawer chooses.');
  const prompt = state.round.choices.find((choice) => choice.id === promptId);
  if (!prompt) return refuse('That was not one of your choices.');
  startDrawing(state, prompt, now, rng, active);
  return OK;
}

function startDrawing(
  state: DoodleState,
  prompt: Prompt,
  now: number,
  rng: () => number,
  active?: Set<string>,
) {
  const round = state.round;
  round.prompt = prompt;
  round.startedAt = now;
  round.endsAt = now + round.duration;
  round.eligible = state.players
    .map((player) => player.id)
    .filter((id) => id !== round.drawerId && (!active || active.has(id)));
  round.revealOrder = shuffle(
    [...prompt.text].flatMap((char, index) => (/[\p{L}\p{N}]/u.test(char) ? [index] : [])),
    rng,
  );
  if (hasDhamaka(round.dhamakas, 'chaos-chat')) round.nextFakeAt = now + 7_000;
  state.usedPromptIds.push(prompt.id);
  state.phase = 'DRAWING';
  push(state, {
    kind: 'system',
    text: `🎨 ${nameOf(state, round.drawerId)} is drawing`,
    visibility: 'all',
    at: now,
  });
}

// ── Hints ───────────────────────────────────────────────────────────────────

const fractionThrough = (round: Round, now: number) =>
  round.startedAt === undefined ? 0 : Math.max(0, (now - round.startedAt) / round.duration);

export function isSuddenDeath(round: Round, now: number) {
  return hasDhamaka(round.dhamakas, 'sudden-death') && fractionThrough(round, now) >= SUDDEN_DEATH_AT;
}

/** Which hint the round is on. Sudden Death freezes it where it stood. */
export function hintStage(round: Round, now: number): number {
  let fraction = fractionThrough(round, now);
  if (hasDhamaka(round.dhamakas, 'sudden-death')) fraction = Math.min(fraction, SUDDEN_DEATH_AT);
  let stage = 0;
  HINT_AT.forEach((threshold, index) => {
    if (fraction >= threshold) stage = index;
  });
  return stage;
}

export function hintFor(round: Round, now: number): HintView | null {
  const prompt = round.prompt;
  if (!prompt) return null;
  const stage = hintStage(round, now);
  const letters = round.revealOrder.length;
  // One letter at the second hint; about a third of them by the last.
  const revealCount = stage >= 3 ? Math.max(2, Math.ceil(letters / 3)) : stage >= 1 ? 1 : 0;
  const revealed = new Set(round.revealOrder.slice(0, Math.min(revealCount, Math.max(0, letters - 1))));
  const mask = [...prompt.text]
    .map((char, index) => {
      if (char === ' ') return '  ';
      if (!/[\p{L}\p{N}]/u.test(char)) return char;
      return revealed.has(index) ? char.toUpperCase() : '_';
    })
    .join(' ')
    .replace(/ {3,}/g, '   ');
  return {
    mask,
    letters,
    stage,
    ...(stage >= 2 ? { category: prompt.category, emoji: prompt.emoji } : {}),
  };
}

// ── Guessing ────────────────────────────────────────────────────────────────

export type GuessOutcome =
  | { kind: 'correct'; points: PointsBreakdown }
  | { kind: 'wrong'; warmth?: Warmth }
  | { kind: 'lock-miss'; penalty: number }
  | { kind: 'chat' }
  | { kind: 'rejected'; reason: string };

const nameOf = (state: DoodleState, id: string) =>
  state.players.find((player) => player.id === id)?.name ?? 'Someone';

function push(state: DoodleState, entry: Omit<FeedEntry, 'id'>) {
  state.feedSeq += 1;
  state.round.feed.push({ ...entry, id: state.feedSeq });
  if (state.round.feed.length > FEED_LIMIT) state.round.feed.splice(0, state.round.feed.length - FEED_LIMIT);
}

/** The points for a correct guess, with every step shown. */
function guessPoints(state: DoodleState, player: DoodlePlayer, now: number, locked: boolean): PointsBreakdown {
  const round = state.round;
  const prompt = round.prompt!;
  const fraction = fractionThrough(round, now);
  const speed = SPEED_BRACKETS.find(([upTo]) => fraction <= upTo)![1];
  const lines: PointsLine[] = [{ label: 'Speed', value: speed }];

  let running = speed;
  const multiply = (label: string, factor: number) => {
    if (factor === 1) return;
    lines.push({ label, value: factor, times: true });
    running *= factor;
  };
  const stage = hintStage(round, now);
  multiply(stage === 1 ? '1 hint out' : `${stage} hints out`, HINT_FACTOR[stage]);
  multiply(DIFFICULTY_LABEL[prompt.difficulty], DIFFICULTY_MULTIPLIER[prompt.difficulty]);
  multiply('Dhamaka', dhamakaMultiplier(round.dhamakas));
  if (locked) multiply('Lock guess', 2);

  let total = Math.round(running);
  const streak = player.streak + 1;
  if (streak >= 3) {
    const bonus = 25 * (Math.min(streak, 6) - 2);
    lines.push({ label: `🔥 ${streak} in a row`, value: bonus });
    total += bonus;
  }
  return { total, lines };
}

export function submitGuess(
  state: DoodleState,
  playerId: string,
  raw: string,
  { lock = false }: { lock?: boolean },
  now: number,
): GuessOutcome {
  const text = raw.trim().slice(0, 60);
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return { kind: 'rejected', reason: 'Join the game first.' };
  if (!text) return { kind: 'rejected', reason: 'Type something first.' };

  const round = state.round;

  // Between drawings nobody holds a secret, so talk is open to the table.
  if (state.phase !== 'DRAWING' || !round.prompt) {
    if (lock) return { kind: 'rejected', reason: 'Nothing to lock in right now.' };
    push(state, { kind: 'chat', playerId, name: player.name, text, visibility: 'all', at: now });
    return { kind: 'chat' };
  }

  const prompt = round.prompt;
  const mine: GuessState = (round.guesses[playerId] ??= { wrong: 0, used: 0, lockUsed: false });

  // The drawer and anyone who has it already can talk — but only to each other.
  if (playerId === round.drawerId || mine.guessedAt !== undefined) {
    if (lock) return { kind: 'rejected', reason: 'You already know it.' };
    if (playerId === round.drawerId && revealsAnswer(text, prompt)) {
      return { kind: 'rejected', reason: 'That would give it away 🤐' };
    }
    push(state, { kind: 'chat', playerId, name: player.name, text, visibility: 'solved', at: now });
    return { kind: 'chat' };
  }

  if (hasDhamaka(round.dhamakas, 'one-guess') && mine.used >= 1) {
    return { kind: 'rejected', reason: 'One Guess Only — you have used yours.' };
  }
  if (lock && mine.lockUsed) return { kind: 'rejected', reason: 'You have already locked a guess this round.' };

  mine.used += 1;
  if (lock) mine.lockUsed = true;

  if (isCorrect(text, prompt)) {
    const points = guessPoints(state, player, now, lock);
    mine.guessedAt = now;
    mine.points = points;
    player.score += points.total;
    player.streak += 1;
    push(state, {
      kind: 'correct',
      playerId,
      name: player.name,
      // Who got it, never what it was.
      text: `${player.name} guessed it!`,
      visibility: 'all',
      at: now,
    });
    if (hasDhamaka(round.dhamakas, 'bonus-time') && round.endsAt !== undefined && round.startedAt !== undefined) {
      round.endsAt = Math.min(round.endsAt + BONUS_TIME_MS, round.startedAt + round.duration + BONUS_TIME_CAP_MS);
    }
    return { kind: 'correct', points };
  }

  mine.wrong += 1;
  // A near miss is only shown to the one who typed it. "Samosaaa" in the open
  // feed hands the answer to everyone reading, and so does naming one of a
  // scene's two ideas.
  const nearMiss = revealsAnswer(text, prompt) || similarity(compact(text), compact(prompt.text)) >= 0.7;
  const visibility: FeedVisibility =
    nearMiss || hasDhamaka(round.dhamakas, 'no-chat') ? { self: playerId } : 'all';

  if (lock) {
    const penalty = Math.min(LOCK_PENALTY, player.score);
    player.score -= penalty;
    mine.penalty = (mine.penalty ?? 0) + penalty;
    push(state, {
      kind: 'lock-miss',
      playerId,
      name: player.name,
      text: `🔒 ${text}`,
      visibility,
      at: now,
    });
    return { kind: 'lock-miss', penalty };
  }

  push(state, { kind: 'guess', playerId, name: player.name, text, visibility, at: now });
  return hasDhamaka(round.dhamakas, 'hot-or-cold')
    ? { kind: 'wrong', warmth: warmth(text, prompt) }
    : { kind: 'wrong' };
}

// ── Drawing ─────────────────────────────────────────────────────────────────

const clampPoint = ([x, y]: [number, number]): [number, number] => [
  Math.round(Math.min(1, Math.max(0, Number(x) || 0)) * 10_000) / 10_000,
  Math.round(Math.min(1, Math.max(0, Number(y) || 0)) * 10_000) / 10_000,
];

/**
 * One piece of the drawer's drawing, checked against the round's Dhamakas.
 *
 * The rules that can be checked here are: a drawing under One Stroke is one
 * line, No Eraser has no eraser or undo, the pens are the pens the round
 * allows. Blind Artist, Mirror Artist and the canvas effects are about what
 * people *see*, so they live in the page rather than here.
 */
export function applyDraw(state: DoodleState, playerId: string, op: DrawOp, now: number): Result {
  const round = state.round;
  if (state.phase !== 'DRAWING') return refuse('Not drawing right now.');
  if (playerId !== round.drawerId) return refuse('Only the drawer can draw.');
  const dh = round.dhamakas;
  const noErasing = hasDhamaka(dh, 'no-eraser') || hasDhamaka(dh, 'one-stroke');

  switch (op?.kind) {
    case 'start': {
      if (typeof op.id !== 'string' || op.id.length > 40) return refuse('Bad stroke.');
      if (round.strokes.some((stroke) => stroke.id === op.id)) return refuse('Bad stroke.');
      if (round.strokes.length >= MAX_STROKES) return refuse('The canvas is full.');
      if (hasDhamaka(dh, 'one-stroke') && (round.strokeSpent || round.strokes.length > 0)) {
        return refuse('One Stroke — your line is drawn.');
      }
      if (op.tool === 'eraser') {
        if (noErasing) return refuse('No erasing this round.');
      } else if (op.tool !== 'pen') {
        return refuse('Bad tool.');
      }
      if (!brushesFor(dh).includes(op.size)) return refuse('That brush is not allowed this round.');
      if (op.tool === 'pen') {
        if (round.onlyColor && op.color !== round.onlyColor) return refuse('One Color — use the colour you were given.');
        // Color Roulette is enforced by the page: the colour depends on the
        // drawer's clock, and a few milliseconds of disagreement is not cheating.
        if (!round.roulette && !round.onlyColor && !PALETTE.includes(op.color)) return refuse('Bad colour.');
      }
      round.strokes.push({
        id: op.id,
        tool: op.tool,
        color: op.tool === 'eraser' ? '#ffffff' : String(op.color).slice(0, 9),
        size: op.size,
        points: [clampPoint(op.point)],
        startedAt: now,
        done: false,
      });
      return OK;
    }
    case 'points': {
      const stroke = round.strokes.find((entry) => entry.id === op.id);
      if (!stroke || stroke.done) return refuse('No such line.');
      if (!Array.isArray(op.points)) return refuse('Bad points.');
      const room = MAX_POINTS_PER_STROKE - stroke.points.length;
      stroke.points.push(...op.points.slice(0, Math.min(room, MAX_POINTS_PER_OP)).map(clampPoint));
      return OK;
    }
    case 'end': {
      const stroke = round.strokes.find((entry) => entry.id === op.id);
      if (!stroke) return refuse('No such line.');
      stroke.done = true;
      if (hasDhamaka(dh, 'one-stroke')) round.strokeSpent = true;
      return OK;
    }
    case 'undo':
      if (noErasing) return refuse('No undo this round.');
      round.strokes.pop();
      return OK;
    case 'clear':
      if (noErasing) return refuse('No clearing this round.');
      round.strokes = [];
      return OK;
    default:
      return refuse('Unknown drawing action.');
  }
}

// ── Ending a round ──────────────────────────────────────────────────────────

export function endRound(state: DoodleState, now: number) {
  if (state.phase !== 'DRAWING') return;
  const round = state.round;
  const prompt = round.prompt!;
  const guessed = Object.entries(round.guesses).filter(([, entry]) => entry.guessedAt !== undefined);
  const eligibleGuessed = round.eligible.filter((id) => round.guesses[id]?.guessedAt !== undefined);
  const outcome: RoundResult['outcome'] =
    guessed.length === 0
      ? 'disaster'
      : round.eligible.length > 0 && eligibleGuessed.length === round.eligible.length
        ? 'perfect'
        : 'normal';

  const points: Record<string, PointsBreakdown> = {};
  for (const [id, entry] of Object.entries(round.guesses)) {
    if (entry.points) points[id] = { total: entry.points.total, lines: [...entry.points.lines] };
    if (entry.penalty) {
      const record = (points[id] ??= { total: 0, lines: [] });
      record.lines.push({ label: 'Missed lock', value: -entry.penalty });
      record.total -= entry.penalty;
    }
  }

  // The drawer is paid for how many people understood the drawing.
  const drawer = state.players.find((player) => player.id === round.drawerId);
  let drawerPoints = 0;
  if (drawer && outcome !== 'disaster') {
    const share = round.eligible.length ? Math.min(1, eligibleGuessed.length / round.eligible.length) : 1;
    const lines: PointsLine[] = [
      { label: `${eligibleGuessed.length} of ${round.eligible.length} got it`, value: Math.round(DRAWER_BASE * share) },
    ];
    let running = DRAWER_BASE * share;
    const difficulty = DIFFICULTY_MULTIPLIER[prompt.difficulty];
    if (difficulty !== 1) {
      lines.push({ label: DIFFICULTY_LABEL[prompt.difficulty], value: difficulty, times: true });
      running *= difficulty;
    }
    const dhamaka = dhamakaMultiplier(round.dhamakas);
    if (dhamaka !== 1) {
      lines.push({ label: 'Dhamaka', value: dhamaka, times: true });
      running *= dhamaka;
    }
    drawerPoints = Math.round(running);
    if (outcome === 'perfect') {
      lines.push({ label: '🎨 Perfect Draw', value: PERFECT_DRAWER_BONUS });
      drawerPoints += PERFECT_DRAWER_BONUS;
    }
    drawer.score += drawerPoints;
    points[drawer.id] = { total: drawerPoints, lines };
  }

  if (outcome === 'perfect') {
    for (const [id] of guessed) {
      const player = state.players.find((entry) => entry.id === id);
      if (!player) continue;
      player.score += PERFECT_GUESSER_BONUS;
      points[id].lines.push({ label: 'Perfect Draw', value: PERFECT_GUESSER_BONUS });
      points[id].total += PERFECT_GUESSER_BONUS;
    }
  }

  // A streak is broken by a round you could have guessed and did not.
  for (const id of round.eligible) {
    if (round.guesses[id]?.guessedAt !== undefined) continue;
    const player = state.players.find((entry) => entry.id === id);
    if (player) player.streak = 0;
  }

  const fastestEntry = guessed.sort((a, b) => a[1].guessedAt! - b[1].guessedAt!)[0];
  const fastest = fastestEntry
    ? { playerId: fastestEntry[0], seconds: Math.round((fastestEntry[1].guessedAt! - round.startedAt!) / 100) / 10 }
    : undefined;

  const wrongGuesses: Record<string, number> = {};
  for (const [id, entry] of Object.entries(round.guesses)) if (entry.wrong) wrongGuesses[id] = entry.wrong;

  const awards: Award[] = [];
  if (fastest) awards.push({ emoji: '⚡', title: 'Lightning Guesser', playerId: fastest.playerId, detail: `${fastest.seconds}s` });
  const chaos = Object.entries(wrongGuesses).sort((a, b) => b[1] - a[1])[0];
  if (chaos && chaos[1] >= 3) awards.push({ emoji: '🤡', title: 'Chaos Guesser', playerId: chaos[0], detail: `${chaos[1]} wrong` });
  if (outcome === 'perfect') awards.push({ emoji: '🎨', title: 'Master Artist', playerId: round.drawerId });
  if (outcome === 'disaster') awards.push({ emoji: '🗿', title: 'Abstract Artist', playerId: round.drawerId });

  round.result = {
    number: round.number,
    drawerId: round.drawerId,
    prompt: { text: prompt.text, category: prompt.category, emoji: prompt.emoji, difficulty: prompt.difficulty },
    dhamakas: round.dhamakas,
    outcome,
    guessed: guessed.length,
    eligible: round.eligible.length,
    ...(fastest ? { fastest } : {}),
    points,
    drawerPoints,
    wrongGuesses,
    awards,
  };
  state.history.push(round.result);
  state.phase = 'ROUND_END';
  round.nextAt = now + RESULT_MS;
  push(state, { kind: 'system', text: `The answer was ${prompt.text}`, visibility: 'all', at: now });
}

function finishGame(state: DoodleState) {
  const standings = [...state.players]
    .sort((a, b) => b.score - a.score)
    .map((player) => ({ playerId: player.id, name: player.name, score: player.score }));

  const tally = (read: (result: RoundResult) => Record<string, number>) => {
    const totals: Record<string, number> = {};
    for (const result of state.history) {
      for (const [id, value] of Object.entries(read(result))) totals[id] = (totals[id] ?? 0) + value;
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  };

  const awards: Award[] = [];
  const artist = tally((result) => (result.drawerPoints ? { [result.drawerId]: result.drawerPoints } : {}));
  if (artist) awards.push({ emoji: '🎨', title: 'Best Artist', playerId: artist[0], detail: `${artist[1]} as drawer` });

  const fastest = state.history
    .filter((result) => result.fastest)
    .sort((a, b) => a.fastest!.seconds - b.fastest!.seconds)[0];
  if (fastest) {
    awards.push({ emoji: '⚡', title: 'Fastest Guesser', playerId: fastest.fastest!.playerId, detail: `${fastest.fastest!.seconds}s` });
  }

  const chaotic = tally((result) => result.wrongGuesses);
  if (chaotic) awards.push({ emoji: '🤡', title: 'Most Chaotic', playerId: chaotic[0], detail: `${chaotic[1]} wrong guesses` });

  const king = tally((result) =>
    result.dhamakas.length >= 2
      ? Object.fromEntries(Object.entries(result.points).map(([id, entry]) => [id, entry.total]))
      : {},
  );
  if (king && king[1] > 0) awards.push({ emoji: '💥', title: 'Dhamaka King', playerId: king[0], detail: `${king[1]} in big rounds` });

  state.final = { standings, awards };
  state.phase = 'GAME_OVER';
}

// ── The clock ───────────────────────────────────────────────────────────────

const DECOYS = WORDS.filter((prompt) => !prompt.keywords).map((prompt) => prompt.text);

/**
 * Moves the game along whenever time is up. Called by the server on a short
 * interval; returns whether anything changed, so it only sends updates that
 * mean something.
 */
export function tick(
  state: DoodleState,
  now: number,
  rng: () => number = Math.random,
  active?: Set<string>,
): boolean {
  const round = state.round;

  if (state.phase === 'CHOOSING') {
    if (now < round.choosingEndsAt) return false;
    // Too slow to pick: the game picks for you, rather than holding everyone up.
    startDrawing(state, pick(round.choices, rng), now, rng, active);
    return true;
  }

  if (state.phase === 'DRAWING') {
    if (round.endsAt !== undefined && now >= round.endsAt) {
      endRound(state, now);
      return true;
    }
    // Everyone still here has got it: nothing left to wait for.
    const waiting = round.eligible.filter((id) => !active || active.has(id));
    if (waiting.length > 0 && waiting.every((id) => round.guesses[id]?.guessedAt !== undefined)) {
      endRound(state, now);
      return true;
    }
    if (round.nextFakeAt !== undefined && now >= round.nextFakeAt && round.prompt) {
      const answer = compact(round.prompt.text);
      const decoys = DECOYS.filter((text) => similarity(compact(text), answer) < 0.4 && !isCorrect(text, round.prompt!));
      push(state, { kind: 'fake', name: 'Someone', text: pick(decoys, rng).toLowerCase(), visibility: 'all', at: now });
      round.nextFakeAt = now + 7_000 + Math.floor(rng() * 5_000);
      return true;
    }
    return false;
  }

  if (state.phase === 'ROUND_END') {
    if (round.nextAt === undefined || now < round.nextAt) return false;
    beginRound(state, round.number, now, rng, active);
    return true;
  }

  return false;
}

// ── What each player may see ────────────────────────────────────────────────

/**
 * The game as one player is allowed to see it.
 *
 * The answer is the secret this whole function exists for. It goes to the
 * drawer, to anyone who has already guessed it, and to everybody once the
 * round is over — and nowhere else, in any form: not as text, not as the
 * scene's keywords, not inside the choices, not in a chat line from someone who
 * knows it.
 */
export function viewFor(state: DoodleState, viewerId: string | null, now: number): DoodleView {
  const round = state.round;
  const isDrawer = viewerId !== null && viewerId === round.drawerId;
  const solved = viewerId !== null && round.guesses[viewerId]?.guessedAt !== undefined;
  const drawingPhase = state.phase === 'DRAWING' || state.phase === 'CHOOSING';
  const knowsAnswer = !drawingPhase || isDrawer || solved;

  const feed = round.feed
    .filter((entry) => {
      if (entry.visibility === 'all') return true;
      if (entry.visibility === 'solved') return knowsAnswer;
      return entry.visibility.self === viewerId;
    })
    .slice(-60);

  const index = round.number - 1;
  let yourTurnIn: number | null = null;
  if (viewerId !== null) {
    if (isDrawer && drawingPhase) yourTurnIn = 0;
    else {
      const next = state.drawOrder.findIndex((id, at) => at > index && id === viewerId);
      yourTurnIn = next === -1 ? null : next - index;
    }
  }

  const prompt = round.prompt;
  return {
    roomCode: state.roomCode,
    you: viewerId,
    serverNow: now,
    phase: state.phase,
    players: state.players.map((player) => ({ ...player })),
    totalRounds: state.drawOrder.length,
    nextDhamakaCount: state.plan[round.number] ?? null,
    yourTurnIn,
    nextDrawerId: state.drawOrder[round.number] ?? null,
    history: state.history,
    ...(state.final ? { final: state.final } : {}),
    round: {
      number: round.number,
      drawerId: round.drawerId,
      dhamakas: round.dhamakas,
      ...(round.combo ? { combo: round.combo } : {}),
      choices: isDrawer && state.phase === 'CHOOSING' ? round.choices : null,
      choosingEndsAt: round.choosingEndsAt,
      startedAt: round.startedAt,
      endsAt: round.endsAt,
      duration: round.duration,
      answer:
        prompt && knowsAnswer
          ? { text: prompt.text, category: prompt.category, emoji: prompt.emoji, difficulty: prompt.difficulty }
          : null,
      hint: prompt && state.phase === 'DRAWING' && !knowsAnswer ? hintFor(round, now) : null,
      suddenDeath: state.phase === 'DRAWING' && isSuddenDeath(round, now),
      eligible: round.eligible,
      solvedBy: Object.entries(round.guesses)
        .filter(([, entry]) => entry.guessedAt !== undefined)
        .map(([id]) => id),
      feed,
      yours: viewerId !== null ? (round.guesses[viewerId] ?? null) : null,
      ...(round.roulette ? { roulette: round.roulette } : {}),
      ...(round.onlyColor ? { onlyColor: round.onlyColor } : {}),
      ...(round.strokeSpent ? { strokeSpent: true } : {}),
      ...(round.result ? { result: round.result } : {}),
      ...(round.nextAt !== undefined ? { nextAt: round.nextAt } : {}),
    },
  };
}
