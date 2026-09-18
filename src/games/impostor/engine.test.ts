import { describe, expect, it } from 'vitest';
import {
  MIN_PLAYERS,
  caughtIds,
  castVote,
  checkAnswer,
  createGame,
  pickImpostors,
  pickSteal,
  submitAnswer,
  tapSuspicion,
  tick,
  timingsFor,
  tiedAtTop,
  topVoted,
  viewFor,
} from './engine';
import { QUESTIONS, decoysFor } from './questions';
import { CHAALS, pickChaal } from './chaals';
import type { ChaalId, ImpostorState, RoundResult } from './types';

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
const TIMES = timingsFor('classic');

/** A game forced into exactly the Chaal asked for, with known impostors. */
function game({
  chaal = null as ChaalId | null,
  impostorIds = ['cat'],
  players = PLAYERS,
} = {}) {
  const state = createGame({ roomCode: 'TEST', players, now: T0, rng: seeded() });
  state.round.chaal = chaal;
  state.round.impostorIds = impostorIds;
  state.round.order = players.map((player) => player.id);
  return state;
}

/** A finished round on the record, for tests that need a history to exist. */
function pastRound(number: number, impostorIds = ['ann']): RoundResult {
  return {
    number,
    question: { text: 'q', category: 'funny', emoji: '😂', difficulty: 'medium' },
    chaal: null,
    impostorIds,
    answers: [],
    votes: {},
    caughtIds: [],
    stoleIds: [],
    mostVotedId: null,
    points: {},
  };
}

/** Run the round up to the vote, answering for everybody. */
function answerAll(state: ImpostorState, now = T0) {
  tick(state, now + TIMES.role, seeded());
  let at = now + TIMES.role;
  while (state.phase === 'ANSWER') {
    const turn = state.round.order[state.round.turn];
    at += 500;
    const answer = state.round.question.format.kind === 'number' ? '5' : 'something';
    expect(submitAnswer(state, turn, answer, at).ok).toBe(true);
  }
  return at;
}

describe('the question is a secret', () => {
  it('never reaches the impostor, and always reaches the crew', () => {
    const state = game();
    const impostor = viewFor(state, 'cat', T0);
    const crew = viewFor(state, 'ann', T0);

    expect(impostor.round.question).toBeNull();
    expect(impostor.round.youAreImpostor).toBe(true);
    expect(crew.round.question?.text).toBe(state.round.question.text);
    expect(crew.round.youAreImpostor).toBe(false);
  });

  it('tells the impostor the answer format, which is the whole game', () => {
    const state = game();
    const view = viewFor(state, 'cat', T0);
    expect(view.round.format).toEqual(state.round.question.format);
    expect(view.round.format.label).toBeTruthy();
  });

  it('never tells one player who anybody else is', () => {
    const view = viewFor(game({ impostorIds: ['cat'] }), 'ann', T0);
    expect(view.round.impostorIds).toBeNull();
    expect(JSON.stringify(view)).not.toContain('"impostorIds":["cat"]');
  });

  it('hides the question from a spectator, not just from the impostor', () => {
    expect(viewFor(game(), null, T0).round.question).toBeNull();
    expect(viewFor(game(), 'stranger', T0).round.question).toBeNull();
  });

  it('opens the question to everyone once the round is scored', () => {
    const state = game();
    const at = answerAll(state);
    // The roles come out at the reveal; the question waits until the points
    // are in, so the steal-back in between is still a real guess.
    state.phase = 'REVEAL';
    expect(viewFor(state, 'cat', at).round.impostorIds).toEqual(['cat']);
    expect(viewFor(state, 'cat', at).round.question).toBeNull();

    state.phase = 'ROUND_END';
    expect(viewFor(state, 'cat', at).round.question?.text).toBe(state.round.question.text);
  });
});

describe('answering', () => {
  it('goes one at a time, in the round order, and refuses queue-jumping', () => {
    const state = game();
    tick(state, T0 + TIMES.role, seeded());
    expect(state.phase).toBe('ANSWER');

    const [first, second] = state.round.order;
    expect(submitAnswer(state, second, 'nope', T0).ok).toBe(false);
    expect(submitAnswer(state, first, 'yes', T0).ok).toBe(true);
    expect(state.round.order[state.round.turn]).toBe(second);
  });

  it('passes the turn on when somebody runs out of time', () => {
    const state = game();
    tick(state, T0 + TIMES.role, seeded());
    const waiting = state.round.order[0];

    tick(state, state.round.endsAt, seeded());
    expect(state.round.answers[0]).toMatchObject({ playerId: waiting, timedOut: true });
    expect(state.round.turn).toBe(1);
  });

  it('reaches discussion once everyone has answered', () => {
    const state = game();
    answerAll(state);
    expect(state.phase).toBe('DISCUSS');
    expect(state.round.answers).toHaveLength(PLAYERS.length);
  });

  it('holds a number question to its range', () => {
    const state = game();
    state.round.question = QUESTIONS.find((question) => question.format.max === 10)!;
    expect(checkAnswer(state.round, '11').ok).toBe(false);
    expect(checkAnswer(state.round, 'seven').ok).toBe(false);
    expect(checkAnswer(state.round, '7').ok).toBe(true);
  });
});

describe('voting', () => {
  it('refuses a self-vote, and a NOBODY vote outside Sab Saaf', () => {
    const state = game();
    const at = answerAll(state);
    state.phase = 'VOTE';
    expect(castVote(state, 'ann', 'ann', at).ok).toBe(false);
    expect(castVote(state, 'ann', null, at).ok).toBe(false);
    expect(castVote(state, 'ann', 'cat', at).ok).toBe(true);
  });

  it('is final in a normal round and changeable under Khulla Vote', () => {
    const plain = game();
    plain.phase = 'VOTE';
    expect(castVote(plain, 'ann', 'cat', T0).ok).toBe(true);
    expect(castVote(plain, 'ann', 'bob', T0).ok).toBe(false);

    const open = game({ chaal: 'khulla-vote' });
    open.phase = 'VOTE';
    expect(castVote(open, 'ann', 'cat', T0).ok).toBe(true);
    expect(castVote(open, 'ann', 'bob', T0).ok).toBe(true);
    expect(open.round.votes.ann).toBe('bob');
  });

  it('keeps votes sealed until the reveal, but shows them live under Khulla Vote', () => {
    const plain = game();
    plain.phase = 'VOTE';
    castVote(plain, 'ann', 'cat', T0);
    expect(viewFor(plain, 'bob', T0).round.votes).toBeNull();
    expect(viewFor(plain, 'bob', T0).round.voted).toEqual(['ann']);

    const open = game({ chaal: 'khulla-vote' });
    open.phase = 'VOTE';
    castVote(open, 'ann', 'cat', T0);
    expect(viewFor(open, 'bob', T0).round.votes).toEqual({ ann: 'cat' });
  });

  it('moves to the reveal the moment the last vote lands', () => {
    const state = game();
    state.phase = 'VOTE';
    PLAYERS.forEach((player) => {
      castVote(state, player.id, player.id === 'cat' ? 'ann' : 'cat', T0);
    });
    expect(state.phase).toBe('REVEAL');
  });

  it('counts a tie at the top as catching everyone in it', () => {
    expect(topVoted({ a: 'x', b: 'y' }).sort()).toEqual(['x', 'y']);
    expect(topVoted({ a: 'x', b: 'x', c: 'y' })).toEqual(['x']);
    expect(topVoted({})).toEqual([]);
  });
});

describe('scoring', () => {
  /** Vote, reveal, skip the steal, and read the points off the result. */
  function play(state: ImpostorState, votes: Record<string, string | null>) {
    state.phase = 'VOTE';
    Object.entries(votes).forEach(([voter, target]) => castVote(state, voter, target, T0));
    if (state.phase === 'VOTE') state.round.endsAt = T0;
    tick(state, T0, seeded());
    // `tick` moves the phase on, which TypeScript cannot see from the assignment
    // above — hence reading it as a plain string here and below.
    while ((state.phase as string) !== 'ROUND_END') tick(state, state.round.endsAt, seeded());
    return state.round.result!;
  }

  it('gives crew +2 for naming the impostor and nothing for missing', () => {
    const state = game();
    const result = play(state, { ann: 'cat', bob: 'cat', dev: 'bob', eve: 'cat', cat: 'ann' });
    expect(result.points.ann.total).toBe(2);
    expect(result.points.dev.total).toBe(0);
  });

  it('gives the impostor +1 for every vote that missed them', () => {
    const state = game();
    // Two of the four other players missed.
    const result = play(state, { ann: 'cat', bob: 'cat', dev: 'bob', eve: 'ann', cat: 'ann' });
    expect(result.points.cat.total).toBe(2);
    expect(result.caughtIds).toEqual(['cat']);
  });

  it('pays an impostor who votes for their fellow impostor nothing for it', () => {
    const state = game({ chaal: 'do-chor', impostorIds: ['cat', 'dev'] });
    const result = play(state, { ann: 'cat', bob: 'cat', eve: 'cat', cat: 'dev', dev: 'ann' });
    // cat named dev, who is an impostor — but cat is one too, so no +2.
    expect(result.points.cat.lines.some((line) => line.label.includes('Caught'))).toBe(false);
  });

  it('lets a caught impostor steal the round back for +3', () => {
    const state = game();
    state.phase = 'VOTE';
    ['ann', 'bob', 'dev', 'eve'].forEach((voter) => castVote(state, voter, 'cat', T0));
    castVote(state, 'cat', 'ann', T0);
    expect(state.phase).toBe('REVEAL');

    tick(state, state.round.endsAt, seeded());
    expect(state.phase).toBe('STEAL');
    expect(state.round.stealChoices).toHaveLength(3);
    expect(state.round.stealChoices.map((question) => question.id)).toContain(state.round.question.id);

    expect(pickSteal(state, 'cat', state.round.question.id, T0).ok).toBe(true);
    expect(state.phase).toBe('ROUND_END');
    expect(state.round.result!.stoleIds).toEqual(['cat']);
    expect(state.round.result!.points.cat.total).toBe(3);
  });

  it('offers the steal only to a caught impostor, and only the three choices', () => {
    const state = game();
    state.phase = 'VOTE';
    ['ann', 'bob', 'dev', 'eve'].forEach((voter) => castVote(state, voter, 'cat', T0));
    castVote(state, 'cat', 'ann', T0);
    tick(state, state.round.endsAt, seeded());

    expect(pickSteal(state, 'ann', state.round.question.id, T0).ok).toBe(false);
    expect(pickSteal(state, 'cat', 'not-a-question', T0).ok).toBe(false);
    expect(viewFor(state, 'ann', T0).round.stealChoices).toBeNull();
    expect(viewFor(state, 'cat', T0).round.stealChoices).toHaveLength(3);
  });

  it('skips the steal entirely when the impostor got away', () => {
    const state = game();
    play(state, { ann: 'bob', bob: 'ann', dev: 'bob', eve: 'bob', cat: 'ann' });
    expect(state.round.result!.caughtIds).toEqual([]);
    expect(state.round.result!.stoleIds).toEqual([]);
  });

  it('scores Sab Saaf on believing there was nobody', () => {
    const state = game({ chaal: 'sab-saaf', impostorIds: [] });
    const result = play(state, { ann: null, bob: null, cat: 'dev', dev: 'eve', eve: null });
    expect(result.points.ann.total).toBe(2);
    expect(result.points.bob.total).toBe(2);
    // dev and eve took one vote each — a tie, so both fooled somebody.
    expect(result.points.dev.total).toBe(1);
    // eve believed it *and* was accused anyway, which is worth both.
    expect(result.points.eve.total).toBe(3);
  });
});

describe('Chaals', () => {
  it('holds Ek Lafaz to one word', () => {
    const state = game({ chaal: 'ek-lafaz' });
    state.round.question = QUESTIONS.find((question) => question.format.kind === 'text')!;
    expect(checkAnswer(state.round, 'two words').ok).toBe(false);
    expect(checkAnswer(state.round, 'pizza').ok).toBe(true);
  });

  it('sends Chup straight from the answers to the vote', () => {
    const state = game({ chaal: 'chup' });
    answerAll(state);
    expect(state.phase).toBe('VOTE');
  });

  it('gives Safai its two most-suspected, in order', () => {
    const state = game({ chaal: 'safai' });
    const at = answerAll(state);
    expect(state.phase).toBe('DISCUSS');
    tapSuspicion(state, 'ann', 'cat');
    tapSuspicion(state, 'bob', 'cat');
    tapSuspicion(state, 'dev', 'eve');

    tick(state, state.round.endsAt, seeded());
    expect(state.phase).toBe('DEFENCE');
    expect(state.round.defendants).toEqual(['cat', 'eve']);
    expect(viewFor(state, 'ann', at).round.defendingId).toBe('cat');

    tick(state, state.round.endsAt, seeded());
    expect(viewFor(state, 'ann', at).round.defendingId).toBe('eve');
    tick(state, state.round.endsAt, seeded());
    expect(state.phase).toBe('VOTE');
  });

  it('keeps who suspected whom private, and the counts public', () => {
    const state = game();
    state.phase = 'DISCUSS';
    tapSuspicion(state, 'ann', 'cat');
    const view = viewFor(state, 'bob', T0);
    expect(view.round.suspicion).toEqual({ cat: 1 });
    expect(view.round.yourSuspicion).toBeNull();
    expect(viewFor(state, 'ann', T0).round.yourSuspicion).toBe('cat');
  });

  it('gives Do Chor two impostors who are not told about each other', () => {
    const state = game({ chaal: 'do-chor', impostorIds: ['cat', 'dev'] });
    expect(viewFor(state, 'cat', T0).round.youAreImpostor).toBe(true);
    expect(viewFor(state, 'cat', T0).round.impostorIds).toBeNull();
  });

  it('never offers Do Chor or Sab Saaf where the spec forbids them', () => {
    const rng = seeded(3);
    for (let attempt = 0; attempt < 400; attempt += 1) {
      expect(pickChaal({ mode: 'chaos', roundNumber: 1, players: 5, used: [], rng })).not.toBe('sab-saaf');
      expect(pickChaal({ mode: 'chaos', roundNumber: 4, players: 4, used: [], rng })).not.toBe('do-chor');
      expect(pickChaal({ mode: 'chaos', roundNumber: 4, players: 8, used: ['sab-saaf'], rng })).not.toBe('sab-saaf');
    }
  });

  it('leaves about half of classic rounds plain', () => {
    const rng = seeded(11);
    let plain = 0;
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      if (pickChaal({ mode: 'classic', roundNumber: 5, players: 6, used: [], rng }) === null) plain += 1;
    }
    expect(plain).toBeGreaterThan(400);
    expect(plain).toBeLessThan(600);
  });

  it('never repeats a Chaal back to back', () => {
    const rng = seeded(5);
    CHAALS.forEach((chaal) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        expect(pickChaal({ mode: 'chaos', roundNumber: 6, players: 8, used: [chaal.id], rng })).not.toBe(chaal.id);
      }
    });
  });
});

describe('the match', () => {
  it('runs one round per player', () => {
    expect(createGame({ roomCode: 'A', players: PLAYERS, now: T0, rng: seeded() }).totalRounds).toBe(5);
  });

  it('favours whoever has not been the impostor lately without promising it', () => {
    const state = createGame({ roomCode: 'A', players: PLAYERS, now: T0, rng: seeded() });
    const ids = PLAYERS.map((player) => player.id);
    state.history = [1, 2, 3, 4].map((number) => pastRound(number));

    const rng = seeded(21);
    const counts = new Map<string, number>();
    for (let attempt = 0; attempt < 2000; attempt += 1) {
      const [picked] = pickImpostors(state, ids, 1, rng);
      counts.set(picked, (counts.get(picked) ?? 0) + 1);
    }
    // ann was the impostor last round, so she is the least likely — but a
    // repeat must stay possible, or the table could rule her out.
    expect(counts.get('ann')!).toBeGreaterThan(0);
    expect(counts.get('ann')!).toBeLessThan(counts.get('bob')!);
  });

  it('plays a Sudden Death round when the top is tied, and only one', () => {
    const state = game();
    state.totalRounds = 1;
    state.players.forEach((player) => {
      player.score = 5;
    });
    state.history = [pastRound(1)];
    state.phase = 'ROUND_END';
    state.round.endsAt = T0;

    tick(state, T0, seeded());
    expect(state.phase).toBe('ROLE');
    expect(state.round.suddenDeath).toBe(true);
    expect(state.round.chaal).toBeNull();

    // Still tied after it: the match ends shared rather than looping forever.
    state.history.push(pastRound(2));
    state.phase = 'ROUND_END';
    state.round.endsAt = T0;
    tick(state, T0, seeded());
    expect(state.phase).toBe('GAME_OVER');
    expect(state.final!.shared).toBe(true);
  });

  it('gives a Sudden Death round no steal-back', () => {
    const state = game();
    state.round.suddenDeath = true;
    state.phase = 'VOTE';
    ['ann', 'bob', 'dev', 'eve'].forEach((voter) => castVote(state, voter, 'cat', T0));
    castVote(state, 'cat', 'ann', T0);
    tick(state, state.round.endsAt, seeded());
    expect(state.phase).toBe('ROUND_END');
  });

  it('spots a shared top', () => {
    expect(tiedAtTop([{ id: 'a', name: 'A', score: 3, streak: 0 }, { id: 'b', name: 'B', score: 3, streak: 0 }])).toBe(true);
    expect(tiedAtTop([{ id: 'a', name: 'A', score: 4, streak: 0 }, { id: 'b', name: 'B', score: 3, streak: 0 }])).toBe(false);
  });

  it('hands out awards at the end', () => {
    const state = game();
    state.totalRounds = 1;
    state.phase = 'VOTE';
    ['ann', 'bob', 'dev', 'eve'].forEach((voter) => castVote(state, voter, 'cat', T0));
    castVote(state, 'cat', 'ann', T0);
    while ((state.phase as string) !== 'GAME_OVER') tick(state, state.round.endsAt, seeded());
    expect(state.final!.awards.some((award) => award.title === 'Master Detective')).toBe(true);
  });
});

describe('the steal-back choices', () => {
  it('offers decoys of the same answer shape, so the format gives nothing away', () => {
    const rng = seeded(13);
    QUESTIONS.slice(0, 40).forEach((question) => {
      decoysFor(question, QUESTIONS, rng).forEach((decoy) => {
        expect(decoy.format.kind).toBe(question.format.kind);
        expect(decoy.id).not.toBe(question.id);
      });
    });
  });
});

describe('the question bank', () => {
  it('has no duplicate ids', () => {
    const ids = QUESTIONS.map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every question an answer format with a label', () => {
    QUESTIONS.forEach((question) => {
      expect(question.format.label.length).toBeGreaterThan(0);
      // A question or an instruction — "Describe your Monday in one word." is
      // both fine and not a question mark.
      expect(/[?.]$/.test(question.text)).toBe(true);
    });
  });

  it('has at least three questions of every shape, so a steal always has decoys', () => {
    const shapes = new Map<string, number>();
    QUESTIONS.forEach((question) => {
      const key = `${question.format.kind}:${question.format.label}`;
      shapes.set(key, (shapes.get(key) ?? 0) + 1);
    });
    shapes.forEach((count) => expect(count).toBeGreaterThanOrEqual(3));
  });

  it('is big enough that a full table never runs the bank dry', () => {
    expect(QUESTIONS.length).toBeGreaterThan(MIN_PLAYERS * 12);
  });
});

describe('any size of table', () => {
  /**
   * Play whole matches at every table size, on many seeds, doing whatever the
   * round asks for.
   *
   * This is the test that catches a Chaal meeting a table it was never tried
   * against — a two-player dev table where nobody can be voted for but yourself,
   * or a twelve-player one where Safai has to pick two out of a crowd. It
   * asserts only that the match reaches its end and that every player's view
   * can still be built at every moment, which is exactly the class of bug that
   * would otherwise turn up mid-game on somebody's phone.
   */
  it('plays a whole match without throwing, whatever the rounds draw', () => {
    for (const size of [2, 4, 5, 8, 12]) {
      const players = Array.from({ length: size }, (_, index) => ({
        id: `p${index}`,
        name: `P${index}`,
      }));

      for (let seed = 1; seed <= 25; seed += 1) {
        const rng = seeded(seed);
        const state = createGame({ roomCode: 'FUZZ', players, now: 0, rng });
        let now = 0;
        let guard = 0;

        while (state.phase !== 'GAME_OVER' && guard < 800) {
          guard += 1;
          now = Math.max(now, state.round.endsAt);

          if (state.phase === 'ANSWER') {
            const who = state.round.order[state.round.turn];
            const format = state.round.question.format;
            const answer =
              format.kind === 'number'
                ? String(format.min ?? 1)
                : format.kind === 'player'
                  ? state.round.order.find((id) => id !== who)!
                  : 'pizza';
            expect(submitAnswer(state, who, answer, now).ok).toBe(true);
            continue;
          }

          if (state.phase === 'VOTE') {
            state.round.order.forEach((id) => {
              const target =
                state.round.chaal === 'sab-saaf' ? null : state.round.order.find((other) => other !== id)!;
              castVote(state, id, target, now);
            });
            // No `continue`: a Khulla Vote round deliberately stays open after
            // the last ballot, and only the clock below closes it.
          }

          if (state.phase === 'STEAL') {
            caughtIds(state.round).forEach((id) => {
              pickSteal(state, id, state.round.stealChoices[0].id, now);
            });
            if ((state.phase as string) !== 'STEAL') continue;
          }

          tick(state, now, rng);
          // Nobody's screen may become unbuildable part-way through a round.
          [...players.map((player) => player.id), null].forEach((id) => viewFor(state, id, now));
        }

        expect(state.phase).toBe('GAME_OVER');
        expect(state.final!.standings).toHaveLength(size);
      }
    }
  });
});

describe('the steal-back is not a free +3', () => {
  /** A caught impostor, sitting in the steal phase with their three choices. */
  function caught() {
    const state = game();
    state.phase = 'VOTE';
    ['ann', 'bob', 'dev', 'eve'].forEach((voter) => castVote(state, voter, 'cat', T0));
    castVote(state, 'cat', 'ann', T0);
    tick(state, state.round.endsAt, seeded());
    expect(state.phase).toBe('STEAL');
    return state;
  }

  it('does not hand the impostor the question while they are choosing', () => {
    const state = caught();
    const view = viewFor(state, 'cat', T0);

    // The whole mechanic: they must name it, not read it.
    expect(view.round.question).toBeNull();
    expect(view.round.stealChoices).toHaveLength(3);
    // The real one is among the three on purpose — what they must not be told
    // is which. Nothing in the payload marks it.
    expect(view.round.stealChoices).toContainEqual({
      id: state.round.question.id,
      text: state.round.question.text,
    });
  });

  it('still tells everyone who was lying, which is the other half of the reveal', () => {
    const state = caught();
    expect(viewFor(state, 'ann', T0).round.impostorIds).toEqual(['cat']);
    expect(viewFor(state, 'cat', T0).round.impostorIds).toEqual(['cat']);
  });

  it('keeps the question shut at the reveal too, before the steal begins', () => {
    const state = game();
    state.phase = 'REVEAL';
    expect(viewFor(state, 'cat', T0).round.question).toBeNull();
    expect(viewFor(state, 'ann', T0).round.question).not.toBeNull();
  });

  it('opens the question to everybody once the round is scored', () => {
    const state = caught();
    pickSteal(state, 'cat', state.round.stealChoices[0].id, T0);
    expect(state.phase).toBe('ROUND_END');
    expect(viewFor(state, 'cat', T0).round.question?.text).toBe(state.round.question.text);
  });

  it('never offers a question the table has already played as a decoy', () => {
    const state = caught();
    const seen = state.usedQuestionIds.filter((id) => id !== state.round.question.id);
    state.round.stealChoices.forEach((choice) => {
      if (choice.id === state.round.question.id) return;
      expect(seen).not.toContain(choice.id);
    });
  });
});

describe('who may touch what', () => {
  it('refuses a suspicion tap from somebody who is not in the round', () => {
    const state = game();
    state.phase = 'DISCUSS';
    expect(tapSuspicion(state, 'latecomer', 'cat').ok).toBe(false);
    expect(tapSuspicion(state, 'ann', 'cat').ok).toBe(true);
  });

  it('lets a Khulla Vote round run its clock out so a vote can still change', () => {
    const open = game({ chaal: 'khulla-vote' });
    open.phase = 'VOTE';
    PLAYERS.forEach((player) => {
      castVote(open, player.id, player.id === 'cat' ? 'ann' : 'cat', T0);
    });
    // Everyone has voted, but the Chaal promised they could change their mind.
    expect(open.phase).toBe('VOTE');
    expect(castVote(open, 'ann', 'bob', T0).ok).toBe(true);

    // The clock is what ends it.
    tick(open, open.round.endsAt, seeded());
    expect(open.phase).toBe('REVEAL');
  });
});
