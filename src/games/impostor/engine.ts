import { pickChaal } from './chaals';
import { QUESTIONS, decoysFor, friendQuestion } from './questions';
import type {
  Answer,
  Award,
  ChaalId,
  FinalResult,
  ImpostorPlayer,
  ImpostorState,
  ImpostorView,
  Mode,
  PointsBreakdown,
  Question,
  Round,
  RoundResult,
  Vote,
} from './types';

/**
 * Impostor's rules.
 *
 * Like Doodle Dhamaka's engine these functions change the state they are handed
 * rather than returning a copy: the server holds exactly one state per room and
 * nobody else has a reference to it, so copying would be work spent on nothing.
 *
 * Time is always passed in, never read from the clock, so any moment of a round
 * can be tested without waiting for it.
 *
 * The one invariant worth stating out loud: the question lives in the state and
 * reaches a player only through `viewFor`, which decides whether they are
 * allowed to see it. No other function in this file hands the question out.
 */

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;

/** Every phase's length, per mode. Quick is the same game in less time. */
interface Timings {
  role: number;
  answer: number;
  discuss: number;
  defence: number;
  vote: number;
  reveal: number;
  steal: number;
  result: number;
}

const BASE: Timings = {
  role: 5_000,
  answer: 25_000,
  discuss: 75_000,
  defence: 20_000,
  vote: 30_000,
  reveal: 6_000,
  steal: 20_000,
  result: 11_000,
};

const QUICK: Timings = {
  ...BASE,
  answer: 18_000,
  discuss: 45_000,
  vote: 20_000,
  result: 8_000,
};

export const timingsFor = (mode: Mode): Timings => (mode === 'quick' ? QUICK : BASE);

/** The last stretch of discussion, when the page starts shouting about it. */
export const FINAL_DEFENCE_MS = 15_000;
/** Sudden Death is one plain round with a short argument and no way out. */
export const SUDDEN_DEATH_DISCUSS_MS = 45_000;

const CREW_CORRECT = 2;
const IMPOSTOR_PER_MISS = 1;
const STEAL_BONUS = 3;
const SAB_SAAF_CORRECT = 2;
const SAB_SAAF_FOOLED = 1;

export type Result = { ok: true } | { ok: false; reason: string };
const refuse = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };

// ── Small tools ─────────────────────────────────────────────────────────────

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const byId = (state: ImpostorState, id: string) => state.players.find((player) => player.id === id);

/** How many rounds a match runs: one per player, as the spec says. */
export const roundsFor = (players: number) => Math.max(3, players);

// ── Choosing who lies ───────────────────────────────────────────────────────

/**
 * Who is the impostor this round.
 *
 * Deliberately not a rotation. If everyone is guaranteed the role exactly once,
 * the last round announces itself — "only Neha has not been it yet" — and the
 * best part of the game is gone. So it is weighted random instead: the longer
 * since you were the impostor, the likelier you are, but nothing is promised
 * and a repeat is always possible.
 *
 * The weighting is never shown to anybody. A player who could see the counts
 * could do the same arithmetic.
 */
export function pickImpostors(
  state: ImpostorState,
  candidates: string[],
  howMany: number,
  rng: () => number,
): string[] {
  const lastSeen = new Map<string, number>();
  state.history.forEach((round) => {
    round.impostorIds.forEach((id) => lastSeen.set(id, round.number));
  });

  const current = state.history.length + 1;
  const pool = candidates.map((id) => {
    const since = lastSeen.has(id) ? current - lastSeen.get(id)! : current + 1;
    // Squared, so "three rounds ago" is meaningfully likelier than "last round"
    // without ever making a repeat impossible.
    return { id, weight: since * since };
  });

  const chosen: string[] = [];
  while (chosen.length < howMany && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let ticket = rng() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i += 1) {
      ticket -= pool[i].weight;
      if (ticket <= 0) {
        index = i;
        break;
      }
    }
    chosen.push(pool.splice(index, 1)[0].id);
  }
  return chosen;
}

function pickQuestion(state: ImpostorState, rng: () => number): Question {
  const stock = QUESTIONS.filter((question) => !state.usedQuestionIds.includes(question.id));
  const friends = state.friendQuestions.filter((question) => !state.usedQuestionIds.includes(question.id));

  // A group's own questions are the best thing in the bank, so they come up
  // often — but never so often that the stock bank stops appearing, or the
  // people who wrote none have nothing to play.
  if (friends.length > 0 && rng() < 0.45) return friends[Math.floor(rng() * friends.length)];
  const pool = stock.length > 0 ? stock : QUESTIONS;
  return pool[Math.floor(rng() * pool.length)];
}

// ── Setting up ──────────────────────────────────────────────────────────────

export function createGame({
  roomCode,
  players,
  mode = 'classic',
  friendQuestions = [],
  now,
  rng = Math.random,
}: {
  roomCode: string;
  players: Array<{ id: string; name: string }>;
  mode?: Mode;
  friendQuestions?: string[];
  now: number;
  rng?: () => number;
}): ImpostorState {
  const state: ImpostorState = {
    roomCode,
    phase: 'ROLE',
    mode,
    players: players.map((player) => ({ id: player.id, name: player.name, score: 0, streak: 0 })),
    totalRounds: roundsFor(players.length),
    round: emptyRound(),
    history: [],
    usedQuestionIds: [],
    friendQuestions: friendQuestions.map(friendQuestion),
    usedChaals: [],
  };
  beginRound(state, now, rng, new Set(players.map((player) => player.id)));
  return state;
}

function emptyRound(): Round {
  return {
    number: 0,
    question: QUESTIONS[0],
    chaal: null,
    impostorIds: [],
    order: [],
    turn: 0,
    answers: [],
    suspicion: {},
    votes: {},
    defendants: [],
    defenceTurn: 0,
    stealChoices: [],
    stealPicks: {},
    suddenDeath: false,
    endsAt: 0,
  };
}

/** A friend arriving mid-game plays from the next round; this one is under way. */
export function addPlayer(state: ImpostorState, player: { id: string; name: string }) {
  if (state.players.some((entry) => entry.id === player.id)) return;
  state.players.push({ id: player.id, name: player.name, score: 0, streak: 0 });
  // The match grows with the table, so a latecomer does not shorten it.
  state.totalRounds = Math.max(state.totalRounds, roundsFor(state.players.length));
}

function beginRound(
  state: ImpostorState,
  now: number,
  rng: () => number,
  active: Set<string>,
  suddenDeath = false,
) {
  const here = state.players.filter((player) => active.has(player.id)).map((player) => player.id);
  const number = state.history.length + 1;

  const chaal = suddenDeath
    ? null
    : pickChaal({ mode: state.mode, roundNumber: number, players: here.length, used: state.usedChaals, rng });
  if (chaal) state.usedChaals.push(chaal);

  const question = pickQuestion(state, rng);
  state.usedQuestionIds.push(question.id);

  const impostorCount = chaal === 'sab-saaf' ? 0 : chaal === 'do-chor' ? 2 : 1;

  state.round = {
    ...emptyRound(),
    number,
    question,
    chaal,
    impostorIds: pickImpostors(state, here, impostorCount, rng),
    // Reshuffled every round. Answering first as the impostor is brutal and
    // answering last is nearly free; rotating that is what keeps it fair.
    order: shuffle(here, rng),
    suddenDeath,
    endsAt: now + timingsFor(state.mode).role,
  };
  state.phase = 'ROLE';
}

// ── Playing ─────────────────────────────────────────────────────────────────

export const isImpostor = (state: ImpostorState, playerId: string) =>
  state.round.impostorIds.includes(playerId);

/** Whose turn it is to answer, or null if we are not in the answer phase. */
export function answeringId(state: ImpostorState): string | null {
  if (state.phase !== 'ANSWER') return null;
  return state.round.order[state.round.turn] ?? null;
}

/**
 * Ek Lafaz means one word, and it is checked rather than trusted — the whole
 * Chaal is that nobody can pad an answer out into cover.
 */
export function checkAnswer(round: Round, text: string): Result {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return refuse('Say something.');
  if (trimmed.length > 60) return refuse('Keep it short — 60 characters.');
  if (round.chaal === 'ek-lafaz' && trimmed.includes(' ')) return refuse('Ek Lafaz: one word only.');

  const { format } = round.question;
  if (format.kind === 'number') {
    const value = Number(trimmed);
    if (!Number.isFinite(value)) return refuse('That wants a number.');
    if (format.min !== undefined && value < format.min) return refuse(`At least ${format.min}.`);
    if (format.max !== undefined && value > format.max) return refuse(`At most ${format.max}.`);
  }
  return OK;
}

export function submitAnswer(state: ImpostorState, playerId: string, text: string, now: number): Result {
  if (state.phase !== 'ANSWER') return refuse('Not the answering phase.');
  if (answeringId(state) !== playerId) return refuse('Wait your turn.');
  const check = checkAnswer(state.round, text);
  if (!check.ok) return check;

  state.round.answers.push({ playerId, text: text.trim().replace(/\s+/g, ' '), at: now });
  advanceAnswer(state, now);
  return OK;
}

function advanceAnswer(state: ImpostorState, now: number) {
  const round = state.round;
  round.turn += 1;
  if (round.turn < round.order.length) {
    round.endsAt = now + timingsFor(state.mode).answer;
    return;
  }
  // Chup skips the argument entirely, which is the point of it.
  if (round.chaal === 'chup') {
    state.phase = 'VOTE';
    round.endsAt = now + timingsFor(state.mode).vote;
    return;
  }
  state.phase = 'DISCUSS';
  round.endsAt = now + (round.suddenDeath ? SUDDEN_DEATH_DISCUSS_MS : timingsFor(state.mode).discuss);
}

/**
 * A non-binding "this one smells" during discussion.
 *
 * It scores nothing and binds nobody — it exists so the table can watch
 * suspicion move in real time, and so Safai has something to pick its two
 * defendants from. Who tapped whom stays private; only the counts are public,
 * or it would just be an early vote with extra steps.
 */
export function tapSuspicion(state: ImpostorState, playerId: string, targetId: string | null): Result {
  if (state.phase !== 'DISCUSS') return refuse('Only during discussion.');
  // A spectator or a mid-round joiner is not in this round and must not be able
  // to move its suspicion counts — which is what Safai reads its defendants off.
  if (!state.round.order.includes(playerId)) return refuse('You are not in this round.');
  if (targetId === playerId) return refuse('Not yourself.');
  if (targetId === null) {
    delete state.round.suspicion[playerId];
    return OK;
  }
  if (!state.round.order.includes(targetId)) return refuse('Not at this table.');
  state.round.suspicion[playerId] = targetId;
  return OK;
}

export function castVote(state: ImpostorState, playerId: string, targetId: string | null, now: number): Result {
  if (state.phase !== 'VOTE') return refuse('Not the voting phase.');
  if (!state.round.order.includes(playerId)) return refuse('You are not in this round.');
  if (targetId === playerId) return refuse('You cannot vote for yourself.');
  if (targetId === null && state.round.chaal !== 'sab-saaf') {
    return refuse('Somebody at this table did not see the question.');
  }
  if (targetId !== null && !state.round.order.includes(targetId)) return refuse('Not at this table.');

  const already = playerId in state.round.votes;
  // A vote is normally final — you get one, and the pressure of that is the
  // point. Khulla Vote is the exception: votes are public as they land, so
  // changing your mind under the weight of a bandwagon is the whole Chaal.
  if (already && state.round.chaal !== 'khulla-vote') return refuse('You have already voted.');

  state.round.votes[playerId] = targetId;
  // A normal round ends the moment the last ballot lands — there is nothing
  // left to wait for. Khulla Vote tells the table they can still change their
  // mind, so it runs its clock out instead of closing under somebody's finger.
  if (
    state.round.chaal !== 'khulla-vote' &&
    Object.keys(state.round.votes).length >= state.round.order.length
  ) {
    finishVoting(state, now);
  }
  return OK;
}

export function pickSteal(state: ImpostorState, playerId: string, questionId: string, now: number): Result {
  if (state.phase !== 'STEAL') return refuse('Not the steal-back.');
  if (!caughtIds(state.round).includes(playerId)) return refuse('You were not caught.');
  if (playerId in state.round.stealPicks) return refuse('You have already chosen.');
  if (!state.round.stealChoices.some((question) => question.id === questionId)) {
    return refuse('Not one of the three.');
  }

  state.round.stealPicks[playerId] = questionId;
  if (Object.keys(state.round.stealPicks).length >= caughtIds(state.round).length) finishRound(state, now);
  return OK;
}

// ── Working out what happened ───────────────────────────────────────────────

/** How many votes each player took. NOBODY votes are counted separately. */
export function tally(votes: Vote): Map<string, number> {
  const counts = new Map<string, number>();
  Object.values(votes).forEach((target) => {
    if (target === null) return;
    counts.set(target, (counts.get(target) ?? 0) + 1);
  });
  return counts;
}

/** Everyone tied for the most votes. A tie catches all of them. */
export function topVoted(votes: Vote): string[] {
  const counts = tally(votes);
  let best = 0;
  counts.forEach((count) => {
    best = Math.max(best, count);
  });
  if (best === 0) return [];
  return [...counts.entries()].filter(([, count]) => count === best).map(([id]) => id);
}

/**
 * The impostors the table actually pinned.
 *
 * "Caught" is finishing on the most votes, ties included. Anything stricter —
 * an outright majority, say — means a five-way split lets an impostor walk with
 * two votes against them and nobody feels that was right.
 */
export const caughtIds = (round: Round) =>
  topVoted(round.votes).filter((id) => round.impostorIds.includes(id));

function finishVoting(state: ImpostorState, now: number) {
  state.phase = 'REVEAL';
  state.round.endsAt = now + timingsFor(state.mode).reveal;
}

function beginSteal(state: ImpostorState, now: number, rng: () => number) {
  const round = state.round;
  // Questions already played are printed in full on their round's score card,
  // so offering one as a decoy narrows a one-in-three guess for anybody who was
  // paying attention. The real question is exempt: it is the one being hidden.
  const pool = [...QUESTIONS, ...state.friendQuestions].filter(
    (question) => question.id === round.question.id || !state.usedQuestionIds.includes(question.id),
  );
  round.stealChoices = shuffle([round.question, ...decoysFor(round.question, pool, rng)], rng);
  state.phase = 'STEAL';
  round.endsAt = now + timingsFor(state.mode).steal;
}

/**
 * The round's points.
 *
 * Each line is kept with its label because the score screen shows the working —
 * a round where you cannot see why you got two points is a round you cannot
 * learn anything from.
 */
function scoreRound(state: ImpostorState): Record<string, PointsBreakdown> {
  const round = state.round;
  const points: Record<string, PointsBreakdown> = {};
  const add = (playerId: string, label: string, value: number) => {
    const entry = (points[playerId] ??= { total: 0, lines: [] });
    if (value === 0) return;
    entry.lines.push({ label, value });
    entry.total += value;
  };
  round.order.forEach((id) => {
    points[id] = { total: 0, lines: [] };
  });

  if (round.chaal === 'sab-saaf') {
    // Nobody was lying. The points are for believing it — and for whoever the
    // table refused to believe anyway.
    Object.entries(round.votes).forEach(([voterId, target]) => {
      if (target === null) add(voterId, 'Saw through it — nobody was lying', SAB_SAAF_CORRECT);
    });
    const fooled = topVoted(round.votes);
    fooled.forEach((id) => add(id, 'Convinced the table you were lying', SAB_SAAF_FOOLED));
    return points;
  }

  // Crew who named an impostor. An impostor who happens to vote for the other
  // impostor in Do Chor gets nothing for it — they are still an impostor.
  Object.entries(round.votes).forEach(([voterId, target]) => {
    if (round.impostorIds.includes(voterId)) return;
    if (target !== null && round.impostorIds.includes(target)) {
      add(voterId, 'Caught an impostor', CREW_CORRECT);
    }
  });

  round.impostorIds.forEach((impostorId) => {
    const missed = Object.entries(round.votes).filter(
      ([voterId, target]) => voterId !== impostorId && target !== impostorId,
    ).length;
    add(impostorId, `Survived ${missed} vote${missed === 1 ? '' : 's'}`, missed * IMPOSTOR_PER_MISS);
    if (round.stealPicks[impostorId] === round.question.id) {
      add(impostorId, 'Stole the round', STEAL_BONUS);
    }
  });

  return points;
}

function finishRound(state: ImpostorState, now: number) {
  const round = state.round;
  const points = scoreRound(state);
  const caught = caughtIds(round);
  const mostVoted = topVoted(round.votes);

  const result: RoundResult = {
    number: round.number,
    question: {
      text: round.question.text,
      category: round.question.category,
      emoji: round.question.emoji,
      difficulty: round.question.difficulty,
    },
    chaal: round.chaal,
    impostorIds: [...round.impostorIds],
    answers: [...round.answers],
    votes: { ...round.votes },
    caughtIds: caught,
    stoleIds: caught.filter((id) => round.stealPicks[id] === round.question.id),
    mostVotedId: mostVoted.length === 1 ? mostVoted[0] : null,
    points,
  };

  Object.entries(points).forEach(([playerId, breakdown]) => {
    const player = byId(state, playerId);
    if (player) player.score += breakdown.total;
  });

  // A streak is consecutive rounds naming an impostor, which a round with no
  // impostor can neither build nor break.
  if (round.chaal !== 'sab-saaf') {
    round.order.forEach((playerId) => {
      const player = byId(state, playerId);
      if (!player || round.impostorIds.includes(playerId)) return;
      const target = round.votes[playerId];
      player.streak = target !== null && target !== undefined && round.impostorIds.includes(target)
        ? player.streak + 1
        : 0;
    });
  }

  round.result = result;
  state.history.push(result);
  state.phase = 'ROUND_END';
  round.endsAt = now + timingsFor(state.mode).result;
}

// ── The end ─────────────────────────────────────────────────────────────────

/** Whether the top of the table is shared, which is what Sudden Death is for. */
export function tiedAtTop(players: ImpostorPlayer[]): boolean {
  if (players.length < 2) return false;
  const best = Math.max(...players.map((player) => player.score));
  return players.filter((player) => player.score === best).length > 1;
}

function awardsFor(state: ImpostorState): Award[] {
  const awards: Award[] = [];
  const stat = (get: (playerId: string) => number) => {
    let bestId: string | null = null;
    let best = 0;
    state.players.forEach((player) => {
      const value = get(player.id);
      if (value > best) {
        best = value;
        bestId = player.id;
      }
    });
    return bestId ? { playerId: bestId as string, value: best } : null;
  };

  const detective = stat((id) =>
    state.history.filter((round) => {
      const target = round.votes[id];
      return !round.impostorIds.includes(id) && target != null && round.impostorIds.includes(target);
    }).length,
  );
  if (detective) {
    awards.push({
      emoji: '🕵️',
      title: 'Master Detective',
      playerId: detective.playerId,
      detail: `${detective.value} impostor${detective.value === 1 ? '' : 's'} caught`,
    });
  }

  const master = stat(
    (id) => state.history.filter((round) => round.impostorIds.includes(id) && !round.caughtIds.includes(id)).length,
  );
  if (master) {
    awards.push({
      emoji: '🎭',
      title: 'Master Impostor',
      playerId: master.playerId,
      detail: `${master.value} round${master.value === 1 ? '' : 's'} survived`,
    });
  }

  const escape = stat((id) => state.history.filter((round) => round.stoleIds.includes(id)).length);
  if (escape) {
    awards.push({
      emoji: '🃏',
      title: 'Escape Artist',
      playerId: escape.playerId,
      detail: `${escape.value} steal${escape.value === 1 ? '' : 's'}`,
    });
  }

  const suspicious = stat((id) =>
    state.history.reduce((sum, round) => sum + (tally(round.votes).get(id) ?? 0), 0),
  );
  if (suspicious) {
    awards.push({
      emoji: '🔥',
      title: 'Most Suspicious',
      playerId: suspicious.playerId,
      detail: `${suspicious.value} votes taken`,
    });
  }

  // Votes collected while entirely innocent — the purest form of this game.
  const chaos = stat((id) =>
    state.history.reduce(
      (sum, round) => sum + (round.impostorIds.includes(id) ? 0 : tally(round.votes).get(id) ?? 0),
      0,
    ),
  );
  if (chaos && chaos.playerId !== suspicious?.playerId) {
    awards.push({
      emoji: '😂',
      title: 'Chaos Agent',
      playerId: chaos.playerId,
      detail: `${chaos.value} votes taken while innocent`,
    });
  }

  const lie = stat((id) => {
    let best = 0;
    let run = 0;
    state.history.forEach((round) => {
      if (round.chaal === 'sab-saaf' || round.impostorIds.includes(id)) return;
      const target = round.votes[id];
      run = target != null && round.impostorIds.includes(target) ? run + 1 : 0;
      best = Math.max(best, run);
    });
    return best;
  });
  if (lie && lie.value >= 2) {
    awards.push({
      emoji: '👀',
      title: 'Human Lie Detector',
      playerId: lie.playerId,
      detail: `${lie.value} rounds in a row`,
    });
  }

  return awards;
}

function endGame(state: ImpostorState) {
  const standings = [...state.players]
    .sort((a, b) => b.score - a.score)
    .map((player) => ({ playerId: player.id, name: player.name, score: player.score }));

  const final: FinalResult = {
    standings,
    awards: awardsFor(state),
    shared: tiedAtTop(state.players),
  };
  state.final = final;
  state.phase = 'GAME_OVER';
}

// ── The clock ───────────────────────────────────────────────────────────────

/**
 * Move the game on if the moment calls for it. Returns whether anything moved.
 *
 * Called on a short interval by the socket server; everything that happens
 * without a player doing something happens here.
 */
export function tick(
  state: ImpostorState,
  now: number,
  rng: () => number = Math.random,
  active: Set<string> = new Set(state.players.map((player) => player.id)),
): boolean {
  if (state.phase === 'GAME_OVER') return false;
  const round = state.round;
  if (now < round.endsAt) return false;

  switch (state.phase) {
    case 'ROLE':
      state.phase = 'ANSWER';
      round.turn = 0;
      round.endsAt = now + timingsFor(state.mode).answer;
      return true;

    case 'ANSWER': {
      // Nobody is held up by someone who has walked away from their phone: the
      // turn passes, and the blank is on the record for the table to read into.
      const playerId = round.order[round.turn];
      if (playerId) round.answers.push({ playerId, text: '…', at: now, timedOut: true });
      advanceAnswer(state, now);
      return true;
    }

    case 'DISCUSS': {
      if (round.chaal === 'safai') {
        round.defendants = mostSuspected(round, 2, rng);
        if (round.defendants.length > 0) {
          state.phase = 'DEFENCE';
          round.defenceTurn = 0;
          round.endsAt = now + timingsFor(state.mode).defence;
          return true;
        }
      }
      state.phase = 'VOTE';
      round.endsAt = now + timingsFor(state.mode).vote;
      return true;
    }

    case 'DEFENCE': {
      round.defenceTurn += 1;
      if (round.defenceTurn < round.defendants.length) {
        round.endsAt = now + timingsFor(state.mode).defence;
        return true;
      }
      state.phase = 'VOTE';
      round.endsAt = now + timingsFor(state.mode).vote;
      return true;
    }

    case 'VOTE':
      // Time is up. Anyone who did not vote simply did not vote.
      finishVoting(state, now);
      return true;

    case 'REVEAL': {
      // Sudden Death has no steal-back: it is one round to settle a tie, and a
      // steal would only make a new one.
      const caught = caughtIds(round);
      if (caught.length > 0 && !round.suddenDeath) {
        beginSteal(state, now, rng);
      } else {
        finishRound(state, now);
      }
      return true;
    }

    case 'STEAL':
      finishRound(state, now);
      return true;

    case 'ROUND_END': {
      if (state.history.length >= state.totalRounds) {
        // One extra round to break a tie at the top, and only one — if it is
        // still shared after that, it is shared.
        if (tiedAtTop(state.players) && !round.suddenDeath) {
          state.totalRounds += 1;
          beginRound(state, now, rng, active, true);
          return true;
        }
        endGame(state);
        return true;
      }
      beginRound(state, now, rng, active);
      return true;
    }

    default:
      return false;
  }
}

/** Safai's two defendants: the most tapped, ties broken by the shuffle. */
export function mostSuspected(round: Round, howMany: number, rng: () => number): string[] {
  const counts = new Map<string, number>();
  Object.values(round.suspicion).forEach((target) => {
    counts.set(target, (counts.get(target) ?? 0) + 1);
  });
  return shuffle(round.order, rng)
    .filter((id) => (counts.get(id) ?? 0) > 0)
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .slice(0, howMany);
}

// ── What one player is allowed to see ───────────────────────────────────────

/**
 * The view, and the only place the question is ever handed out.
 *
 * An impostor is sent `question: null` and `format` — that pair is the game. A
 * spectator, who is not in the round at all, is treated as an impostor for this
 * purpose: they are not playing, and someone watching over a shoulder must not
 * be able to read the answer off their screen either.
 */
export function viewFor(state: ImpostorState, playerId: string | null, now: number): ImpostorView {
  const round = state.round;

  /**
   * Who was lying comes out at the reveal. The *question* does not.
   *
   * These are deliberately two different moments. Between them sits the
   * steal-back, where a caught impostor has to name the real question out of
   * three — and an impostor who has already been handed the question is being
   * asked to pick their own answer out of a hat for three free points. So the
   * question stays shut until the round is actually scored.
   */
  const rolesOut =
    state.phase === 'REVEAL' ||
    state.phase === 'STEAL' ||
    state.phase === 'ROUND_END' ||
    state.phase === 'GAME_OVER';
  const questionOut = state.phase === 'ROUND_END' || state.phase === 'GAME_OVER';

  const playing = playerId !== null && round.order.includes(playerId);
  const hidden = !playing || round.impostorIds.includes(playerId);

  const suspicionCounts: Record<string, number> = {};
  Object.values(round.suspicion).forEach((target) => {
    suspicionCounts[target] = (suspicionCounts[target] ?? 0) + 1;
  });

  const caught = caughtIds(round);
  const youAreCaught = playerId !== null && caught.includes(playerId);

  return {
    roomCode: state.roomCode,
    you: playerId,
    serverNow: now,
    phase: state.phase,
    mode: state.mode,
    players: state.players,
    totalRounds: state.totalRounds,
    history: state.history,
    final: state.final,
    round: {
      number: round.number,
      question:
        hidden && !questionOut
          ? null
          : {
              text: round.question.text,
              category: round.question.category,
              emoji: round.question.emoji,
              difficulty: round.question.difficulty,
            },
      format: round.question.format,
      chaal: round.chaal,
      suddenDeath: round.suddenDeath,
      youAreImpostor: playerId !== null && round.impostorIds.includes(playerId),
      impostorIds: rolesOut ? round.impostorIds : null,
      order: round.order,
      answeringId: answeringId(state),
      answers: round.answers,
      suspicion: suspicionCounts,
      yourSuspicion: playerId ? round.suspicion[playerId] ?? null : null,
      defendants: round.defendants,
      defendingId: state.phase === 'DEFENCE' ? round.defendants[round.defenceTurn] ?? null : null,
      // Votes stay sealed until everybody has cast one — unless the Chaal is
      // Khulla Vote, which exists precisely to make them public as they land.
      votes: rolesOut || round.chaal === 'khulla-vote' ? round.votes : null,
      voted: Object.keys(round.votes),
      yourVote: playerId ? round.votes[playerId] : undefined,
      // Only a caught impostor, and only while they are deciding.
      stealChoices:
        state.phase === 'STEAL' && youAreCaught
          ? round.stealChoices.map((question) => ({ id: question.id, text: question.text }))
          : null,
      stealingIds: state.phase === 'STEAL' ? caught : [],
      endsAt: round.endsAt,
      result: round.result,
    },
  };
}
