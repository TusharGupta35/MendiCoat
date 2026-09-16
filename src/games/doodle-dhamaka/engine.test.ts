import { describe, expect, it } from 'vitest';
import {
  BONUS_TIME_MS,
  CHOOSE_MS,
  PANIC_MS,
  RESULT_MS,
  ROUND_MS,
  applyDraw,
  choosePrompt,
  createGame,
  endRound,
  hintFor,
  submitGuess,
  tick,
  viewFor,
} from './engine';
import { planDhamakas, pickDhamakas, DHAMAKAS } from './dhamakas';
import type { DhamakaId, DoodleState, DrawOp, Prompt } from './types';
import { WORDS } from './words';

/** A repeatable stand-in for Math.random. */
function seeded(seed = 7) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

const PLAYERS = ['ann', 'bob', 'cat', 'dev', 'eve'].map((id) => ({ id, name: id.toUpperCase() }));
const T0 = 1_000_000;

const SAMOSA = WORDS.find((prompt) => prompt.text === 'Samosa')!;
const DOG_CAR = WORDS.find((prompt) => prompt.text === 'Dog driving a car')!;

/**
 * A game already drawing the given prompt, under exactly the Dhamakas asked for
 * (none unless named), so each rule can be tested on its own.
 */
function drawing(prompt: Prompt = SAMOSA, dhamakas: DhamakaId[] = [], players = PLAYERS) {
  const rng = seeded();
  const state = createGame({ roomCode: 'TEST', players, now: T0, rng });
  state.round.dhamakas = dhamakas;
  state.round.duration = dhamakas.includes('panic') ? PANIC_MS : ROUND_MS;
  if (dhamakas.includes('one-color')) state.round.onlyColor = '#dc2626';
  state.round.choices = [prompt, ...state.round.choices.slice(1)];
  const result = choosePrompt(state, state.round.drawerId, prompt.id, T0, rng);
  expect(result.ok).toBe(true);
  const guessers = state.players.map((player) => player.id).filter((id) => id !== state.round.drawerId);
  return { state, drawer: state.round.drawerId, guessers, rng };
}

const scoreOf = (state: DoodleState, id: string) => state.players.find((player) => player.id === id)!.score;

describe('setting up a game', () => {
  it('has everyone draw twice at a small table, and nobody twice before everyone once', () => {
    const state = createGame({ roomCode: 'T', players: PLAYERS, now: T0, rng: seeded() });
    expect(state.drawOrder).toHaveLength(10);
    const firstLap = state.drawOrder.slice(0, 5);
    expect(new Set(firstLap).size).toBe(5);
    expect(state.drawOrder.slice(5)).toEqual(firstLap);
  });

  it('has everyone draw once at a big table', () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    expect(createGame({ roomCode: 'T', players: eight, now: T0, rng: seeded() }).drawOrder).toHaveLength(8);
  });

  it('builds up to a Grand Dhamaka, with Doubles along the way', () => {
    expect(planDhamakas(10)).toEqual([1, 1, 1, 2, 1, 1, 1, 2, 1, 3]);
  });

  it('never draws two Dhamakas that fight over the same thing', () => {
    const rng = seeded(3);
    for (let run = 0; run < 300; run += 1) {
      const slots = pickDhamakas(3, rng).map((id) => DHAMAKAS.find((entry) => entry.id === id)!.slot);
      expect(new Set(slots).size).toBe(slots.length);
    }
  });

  it('offers one easy, one medium and one wild choice', () => {
    const state = createGame({ roomCode: 'T', players: PLAYERS, now: T0, rng: seeded() });
    const [easy, medium, wild] = state.round.choices;
    expect(easy.difficulty).toBe('easy');
    expect(medium.difficulty).toBe('medium');
    expect(['hard', 'dhamaka', 'friends']).toContain(wild.difficulty);
  });

  it("works the group's own words into the wild choice", () => {
    let sawFriend = false;
    for (let seed = 1; seed < 40 && !sawFriend; seed += 1) {
      const state = createGame({
        roomCode: 'T', players: PLAYERS, friendWords: ['Goa Trip'], now: T0, rng: seeded(seed),
      });
      sawFriend = state.round.choices.some((choice) => choice.text === 'Goa Trip');
    }
    expect(sawFriend).toBe(true);
  });
});

describe('the answer never leaks', () => {
  /** Everything a player is sent, as text, so a leak anywhere in it is caught. */
  const wire = (state: DoodleState, id: string, now = T0 + 1000) =>
    JSON.stringify(viewFor(state, id, now)).toLowerCase();

  it('shows the choices to the drawer and nobody else', () => {
    const state = createGame({ roomCode: 'T', players: PLAYERS, now: T0, rng: seeded() });
    const drawer = state.round.drawerId;
    const other = PLAYERS.find((player) => player.id !== drawer)!.id;
    expect(viewFor(state, drawer, T0).round.choices).toHaveLength(3);
    expect(viewFor(state, other, T0).round.choices).toBeNull();
    for (const choice of state.round.choices) expect(wire(state, other, T0)).not.toContain(choice.text.toLowerCase());
  });

  it('keeps the answer out of every guesser’s view, and gives it to the drawer', () => {
    const { state, drawer, guessers } = drawing();
    expect(viewFor(state, drawer, T0).round.answer?.text).toBe('Samosa');
    for (const id of guessers) {
      expect(viewFor(state, id, T0).round.answer).toBeNull();
      expect(wire(state, id)).not.toContain('samosa');
    }
  });

  it('never leaks a scene’s keywords either', () => {
    const { state, guessers } = drawing(DOG_CAR);
    for (const id of guessers) {
      expect(wire(state, id)).not.toContain('driving');
      expect(wire(state, id)).not.toContain('kutta');
    }
  });

  it('announces who guessed it, never what it was', () => {
    const { state, guessers } = drawing();
    const [winner, other] = guessers;
    expect(submitGuess(state, winner, 'samosa', {}, T0 + 5000).kind).toBe('correct');
    expect(viewFor(state, other, T0 + 5000).round.feed.some((line) => line.kind === 'correct')).toBe(true);
    expect(wire(state, other, T0 + 5000)).not.toContain('samosa');
    // The one who got it may now see it.
    expect(viewFor(state, winner, T0 + 5000).round.answer?.text).toBe('Samosa');
  });

  it('keeps chat from people who know it away from people who do not', () => {
    const { state, drawer, guessers } = drawing();
    const [winner, other] = guessers;
    submitGuess(state, winner, 'samosa', {}, T0 + 5000);
    submitGuess(state, winner, 'so crispy and triangular', {}, T0 + 6000);
    expect(wire(state, other, T0 + 6000)).not.toContain('triangular');
    expect(wire(state, drawer, T0 + 6000)).toContain('triangular');
  });

  it('shows a near miss to its author alone', () => {
    const { state, guessers } = drawing();
    const [typer, other] = guessers;
    expect(submitGuess(state, typer, 'samosaaaa', {}, T0 + 5000).kind).toBe('wrong');
    expect(wire(state, other, T0 + 5000)).not.toContain('samosa');
    expect(wire(state, typer, T0 + 5000)).toContain('samosaaaa');
  });

  it('stops the drawer typing the answer', () => {
    const { state, drawer } = drawing();
    expect(submitGuess(state, drawer, "it's a samosa lol", {}, T0 + 5000)).toMatchObject({ kind: 'rejected' });
  });

  it('opens the answer to everyone once the round is over', () => {
    const { state, guessers } = drawing();
    endRound(state, T0 + 10_000);
    expect(viewFor(state, guessers[0], T0 + 10_000).round.answer?.text).toBe('Samosa');
  });
});

describe('hints', () => {
  it('start as blanks and fill in as the clock runs', () => {
    const { state } = drawing();
    const at = (fraction: number) => hintFor(state.round, T0 + ROUND_MS * fraction)!;
    expect(at(0).mask.replace(/ /g, '')).toBe('______');
    expect(at(0).category).toBeUndefined();
    expect(at(0.4).mask.replace(/[ _]/g, '')).toHaveLength(1);
    expect(at(0.6).category).toBe('Food');
    expect(at(0.8).mask.replace(/[ _]/g, '').length).toBeGreaterThanOrEqual(2);
    // Never the whole word.
    expect(at(0.99).mask.includes('_')).toBe(true);
  });

  it('stop for good under Sudden Death', () => {
    const { state } = drawing(SAMOSA, ['sudden-death']);
    expect(hintFor(state.round, T0 + ROUND_MS * 0.95)!.stage).toBe(2);
    expect(viewFor(state, 'x', T0 + ROUND_MS * 0.8).round.suddenDeath).toBe(true);
  });
});

describe('scoring', () => {
  it('pays a fast guess more than a slow one', () => {
    const { state, guessers } = drawing();
    const [fast, slow] = guessers;
    const quick = submitGuess(state, fast, 'samosa', {}, T0 + 5_000);
    const late = submitGuess(state, slow, 'samosa', {}, T0 + 60_000);
    expect(quick.kind === 'correct' && late.kind === 'correct').toBe(true);
    if (quick.kind !== 'correct' || late.kind !== 'correct') return;
    // Easy word, no hints, no Dhamaka: speed is the whole score.
    expect(quick.points.total).toBe(500);
    expect(late.points.total).toBeLessThan(quick.points.total);
  });

  it('charges for the hints that were out, and pays for difficulty', () => {
    const { state, guessers } = drawing(DOG_CAR);
    const result = submitGuess(state, guessers[0], 'dog in a car', {}, T0 + ROUND_MS * 0.4);
    expect(result.kind).toBe('correct');
    if (result.kind !== 'correct') return;
    // 300 for speed, one hint out ×0.85, a Dhamaka-tier prompt ×2.
    expect(result.points.total).toBe(Math.round(300 * 0.85 * 2));
    expect(result.points.lines.map((line) => line.label)).toEqual(['Speed', '1 hint out', 'Dhamaka']);
  });

  it('doubles a locked guess that lands, and fines one that misses', () => {
    const { state, guessers } = drawing();
    const [brave, reckless] = guessers;
    const hit = submitGuess(state, brave, 'samosa', { lock: true }, T0 + 5_000);
    expect(hit.kind === 'correct' && hit.points.total).toBe(1000);

    state.players.find((player) => player.id === reckless)!.score = 200;
    expect(submitGuess(state, reckless, 'pizza', { lock: true }, T0 + 6_000)).toEqual({ kind: 'lock-miss', penalty: 50 });
    expect(scoreOf(state, reckless)).toBe(150);
    // One lock per round.
    expect(submitGuess(state, reckless, 'samosa', { lock: true }, T0 + 7_000).kind).toBe('rejected');
    // But normal guessing carries on.
    expect(submitGuess(state, reckless, 'samosa', {}, T0 + 7_000).kind).toBe('correct');
  });

  it('pays a streak from the third correct guess in a row', () => {
    const { state, guessers } = drawing();
    const hot = state.players.find((player) => player.id === guessers[0])!;
    hot.streak = 2;
    const result = submitGuess(state, hot.id, 'samosa', {}, T0 + 5_000);
    expect(result.kind === 'correct' && result.points.lines.at(-1)).toEqual({ label: '🔥 3 in a row', value: 25 });
  });

  it('pays the drawer by how many people got it, with a bonus for everyone', () => {
    const { state, drawer, guessers } = drawing();
    for (const id of guessers) submitGuess(state, id, 'samosa', {}, T0 + 5_000);
    endRound(state, T0 + 6_000);
    expect(state.round.result?.outcome).toBe('perfect');
    expect(state.round.result?.points[drawer].total).toBe(300 + 150);
    expect(state.round.result?.points[guessers[0]].total).toBe(500 + 50);
  });

  it('pays the drawer nothing when nobody got it', () => {
    const { state, drawer } = drawing();
    endRound(state, T0 + ROUND_MS);
    expect(state.round.result?.outcome).toBe('disaster');
    expect(scoreOf(state, drawer)).toBe(0);
    expect(state.round.result?.awards.map((award) => award.title)).toContain('Abstract Artist');
  });

  it('breaks the streak of anyone who could have guessed and did not', () => {
    const { state, guessers } = drawing();
    const cold = state.players.find((player) => player.id === guessers[0])!;
    cold.streak = 4;
    endRound(state, T0 + ROUND_MS);
    expect(cold.streak).toBe(0);
  });
});

describe('Dhamakas', () => {
  const pen = (id: string, size = 9, color = '#1f1b2e'): DrawOp => ({
    kind: 'start', id, tool: 'pen', color, size, point: [0.5, 0.5],
  });

  it('One Stroke: one line, and no taking it back', () => {
    const { state, drawer } = drawing(SAMOSA, ['one-stroke']);
    expect(applyDraw(state, drawer, pen('a'), T0).ok).toBe(true);
    expect(applyDraw(state, drawer, { kind: 'end', id: 'a' }, T0).ok).toBe(true);
    expect(applyDraw(state, drawer, pen('b'), T0).ok).toBe(false);
    expect(applyDraw(state, drawer, { kind: 'undo' }, T0).ok).toBe(false);
    expect(applyDraw(state, drawer, { kind: 'clear' }, T0).ok).toBe(false);
  });

  it('No Eraser: no eraser, undo or clear', () => {
    const { state, drawer } = drawing(SAMOSA, ['no-eraser']);
    expect(applyDraw(state, drawer, { ...pen('e'), tool: 'eraser' } as DrawOp, T0).ok).toBe(false);
    expect(applyDraw(state, drawer, { kind: 'undo' }, T0).ok).toBe(false);
    expect(applyDraw(state, drawer, { kind: 'clear' }, T0).ok).toBe(false);
  });

  it('Tiny Pen and Giant Pen: only their brush', () => {
    const tiny = drawing(SAMOSA, ['tiny-pen']);
    expect(applyDraw(tiny.state, tiny.drawer, pen('a', 9), T0).ok).toBe(false);
    expect(applyDraw(tiny.state, tiny.drawer, pen('b', 2), T0).ok).toBe(true);
    const giant = drawing(SAMOSA, ['giant-pen']);
    expect(applyDraw(giant.state, giant.drawer, pen('a', 60), T0).ok).toBe(true);
  });

  it('One Color: only the colour you were given', () => {
    const { state, drawer } = drawing(SAMOSA, ['one-color']);
    expect(applyDraw(state, drawer, pen('a', 9, '#2563eb'), T0).ok).toBe(false);
    expect(applyDraw(state, drawer, pen('b', 9, '#dc2626'), T0).ok).toBe(true);
  });

  it('only lets the drawer draw', () => {
    const { state, guessers } = drawing();
    expect(applyDraw(state, guessers[0], pen('a'), T0).ok).toBe(false);
  });

  it('One Guess Only: a second guess is refused', () => {
    const { state, guessers } = drawing(SAMOSA, ['one-guess']);
    expect(submitGuess(state, guessers[0], 'pizza', {}, T0 + 1000).kind).toBe('wrong');
    expect(submitGuess(state, guessers[0], 'samosa', {}, T0 + 2000).kind).toBe('rejected');
  });

  it('No Chat: a wrong guess is seen only by the one who made it', () => {
    const { state, guessers } = drawing(SAMOSA, ['no-chat']);
    submitGuess(state, guessers[0], 'pizza', {}, T0 + 1000);
    expect(viewFor(state, guessers[1], T0 + 1000).round.feed.some((line) => line.text === 'pizza')).toBe(false);
    expect(viewFor(state, guessers[0], T0 + 1000).round.feed.some((line) => line.text === 'pizza')).toBe(true);
  });

  it('Hot or Cold: a wrong guess says how close it was', () => {
    const { state, guessers } = drawing(DOG_CAR, ['hot-or-cold']);
    expect(submitGuess(state, guessers[0], 'dog', {}, T0 + 1000)).toEqual({ kind: 'wrong', warmth: 'hot' });
    expect(submitGuess(state, guessers[1], 'banana', {}, T0 + 1000)).toEqual({ kind: 'wrong', warmth: 'cold' });
  });

  it('Chaos Chat: fake guesses turn up, and are never the answer', () => {
    const { state, rng } = drawing(SAMOSA, ['chaos-chat']);
    // Stop short of the end, so the round is still the one being watched.
    for (let second = 1; second < 79; second += 1) tick(state, T0 + second * 1000, rng);
    const fakes = state.round.feed.filter((line) => line.kind === 'fake');
    expect(fakes.length).toBeGreaterThan(3);
    expect(fakes.every((line) => !line.text.includes('samosa'))).toBe(true);
  });

  it('30-Second Panic: the round is thirty seconds and worth more', () => {
    const { state, guessers } = drawing(SAMOSA, ['panic']);
    expect(state.round.endsAt).toBe(T0 + PANIC_MS);
    const result = submitGuess(state, guessers[0], 'samosa', {}, T0 + 2_000);
    expect(result.kind === 'correct' && result.points.total).toBe(750);
  });

  it('Bonus Time: every correct guess buys five seconds', () => {
    const { state, guessers } = drawing(SAMOSA, ['bonus-time']);
    submitGuess(state, guessers[0], 'samosa', {}, T0 + 10_000);
    expect(state.round.endsAt).toBe(T0 + ROUND_MS + BONUS_TIME_MS);
  });
});

describe('the clock', () => {
  it('picks a word for a drawer who takes too long', () => {
    const state = createGame({ roomCode: 'T', players: PLAYERS, now: T0, rng: seeded() });
    expect(tick(state, T0 + CHOOSE_MS - 1)).toBe(false);
    expect(tick(state, T0 + CHOOSE_MS)).toBe(true);
    expect(state.phase).toBe('DRAWING');
  });

  it('ends the round the moment everyone has it', () => {
    const { state, guessers } = drawing();
    for (const id of guessers) submitGuess(state, id, 'samosa', {}, T0 + 5_000);
    expect(tick(state, T0 + 5_001)).toBe(true);
    expect(state.phase).toBe('ROUND_END');
  });

  it('does not wait on someone who has left', () => {
    const { state, guessers } = drawing();
    const [gone, ...here] = guessers;
    for (const id of here) submitGuess(state, id, 'samosa', {}, T0 + 5_000);
    const active = new Set(state.players.map((player) => player.id).filter((id) => id !== gone));
    expect(tick(state, T0 + 5_001, Math.random, active)).toBe(true);
    // Somebody missed it, so it was not a Perfect Draw.
    expect(state.round.result?.outcome).toBe('normal');
  });

  it('ends the round when time runs out, then moves on to the next drawer', () => {
    const { state, drawer } = drawing();
    tick(state, T0 + ROUND_MS);
    expect(state.phase).toBe('ROUND_END');
    tick(state, T0 + ROUND_MS + RESULT_MS);
    expect(state.phase).toBe('CHOOSING');
    expect(state.round.number).toBe(2);
    expect(state.round.drawerId).not.toBe(drawer);
  });

  it('skips a drawer who is not here', () => {
    const { state } = drawing();
    const nextDrawer = state.drawOrder[1];
    const active = new Set(state.players.map((player) => player.id).filter((id) => id !== nextDrawer));
    tick(state, T0 + ROUND_MS, Math.random, active);
    tick(state, T0 + ROUND_MS + RESULT_MS, Math.random, active);
    expect(state.round.drawerId).not.toBe(nextDrawer);
    expect(state.round.number).toBe(3);
  });

  it('plays a whole game through to a final leaderboard', () => {
    const rng = seeded(11);
    const state = createGame({ roomCode: 'T', players: PLAYERS, now: T0, rng });
    let now = T0;
    for (let step = 0; step < 400 && state.phase !== 'GAME_OVER'; step += 1) {
      now += 1_000;
      if (state.phase === 'DRAWING' && state.round.prompt) {
        // Everyone answers, so each round ends early rather than on the clock.
        const answer = state.round.prompt.keywords
          ? state.round.prompt.keywords.map((group) => group[0]).join(' ')
          : state.round.prompt.text;
        for (const guesser of state.players) {
          if (guesser.id === state.round.drawerId || state.round.guesses[guesser.id]?.used) continue;
          submitGuess(state, guesser.id, answer, {}, now);
        }
      }
      tick(state, now, rng);
    }
    expect(state.phase).toBe('GAME_OVER');
    expect(state.history).toHaveLength(10);
    const scores = state.final!.standings.map((row) => row.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(state.final!.awards.length).toBeGreaterThan(0);
  });
});
