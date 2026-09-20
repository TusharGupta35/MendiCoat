'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { chaalById } from './chaals';
import { CATEGORY_LABEL } from './questions';
import { IMPOSTOR_REACTIONS } from './reactions';
import type { Answer, AnswerFormat, ImpostorView, RoundResult } from './types';

/**
 * Every screen a round passes through.
 *
 * Kept apart from RoomClient for the same reason Doodle Dhamaka's Panels are:
 * the client's job is the socket and the clock, and these only draw what they
 * are handed. Nothing in this file decides anything — in particular, nothing
 * here decides whether you may see the question. The server did that.
 *
 * Painted only in the app's slate and amber, so Impostor re-skins with the rest
 * of the app. The two exceptions are load-bearing rather than decorative: rose
 * means "impostor, or the thing that catches one" and emerald means "crew, or
 * the thing that clears one", and they mean that on every screen here.
 */

export interface Person {
  id: string;
  name: string;
  avatar: string | null;
}

export const personIn = (people: Person[], id: string | null | undefined) =>
  people.find((person) => person.id === id);

export const nameOf = (people: Person[], id: string | null | undefined) =>
  personIn(people, id)?.name ?? 'someone';

/** Every tappable thing clears the 44px the thumb actually needs. */
const TAP = 'min-h-11';

// ── The clock ───────────────────────────────────────────────────────────────

/**
 * Seconds left, and a bar that empties.
 *
 * `urgent` is what Final Defence uses: the last stretch of discussion turns the
 * bar red and says so, because a vote that arrives without warning feels like a
 * bug rather than a climax.
 */
export function Countdown({
  endsAt,
  now,
  total,
  urgent,
  note,
}: {
  endsAt: number;
  now: number;
  total: number;
  urgent?: boolean;
  note?: string;
}) {
  const left = Math.max(0, endsAt - now);
  const seconds = Math.ceil(left / 1000);
  const share = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;

  return (
    <div className="flex items-center gap-3">
      {note ? (
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
          {note}
        </span>
      ) : null}
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-linear ${
            urgent ? 'bg-rose-400' : 'bg-amber-400'
          }`}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <span
        className={`w-9 shrink-0 text-right text-sm font-bold tabular-nums ${
          urgent ? 'text-rose-300' : 'text-slate-300'
        }`}
      >
        {seconds}s
      </span>
    </div>
  );
}

// ── What to do now ──────────────────────────────────────────────────────────

/**
 * The briefing: what is happening, and what this player should be doing.
 *
 * Impostor is a talking game with private information, and a table that has
 * never played it cannot work out from the screen alone whose turn it is, what
 * a suspicion tap costs (nothing) or what a vote is worth (two, or one to the
 * impostor for every vote that misses). Everything here was previously either
 * in the rules page nobody opens mid-game or in somebody's head.
 *
 * It is one strip, in the same place every phase, and it always speaks to *you*
 * — the impostor and the crew are told different things, which is why this
 * cannot be a static rules box.
 */
interface Guide {
  label: string;
  title: string;
  body: string;
  /** What it is worth, when a phase has points riding on it. */
  stakes?: string;
  tone: 'crew' | 'impostor' | 'neutral';
}

function guideFor(view: ImpostorView, yourTurn: boolean, finalDefence: boolean): Guide | null {
  const { phase } = view;
  const { youAreImpostor, format, suddenDeath, answeringId, order, yourVote, voted, stealingIds } = view.round;
  const impostor = youAreImpostor;
  const watching = view.you === null || !order.includes(view.you);

  if (phase === 'GAME_OVER') return null;
  if (watching) {
    return {
      label: 'Watching',
      title: 'You are sitting this round out',
      body: 'The round started before you got here. You are dealt in for the next one — watch how people bluff.',
      tone: 'neutral',
    };
  }

  switch (phase) {
    case 'ROLE':
      return impostor
        ? {
            label: 'Your role',
            title: 'You are the impostor',
            body: `You will not be shown the question — only what the answer has to be: ${format.label} Listen to the others, work out what was asked, and answer as if you knew it all along.`,
            tone: 'impostor',
          }
        : {
            label: 'Your role',
            title: 'You are crew',
            body: 'You will see the question. Answer it so the table believes you read it — but not so exactly that the impostor can copy you.',
            tone: 'crew',
          };

    case 'ANSWER':
      if (yourTurn) {
        return {
          label: 'Your turn',
          title: impostor ? 'Answer without the question' : 'Answer the question',
          body: impostor
            ? 'Everyone is watching. Give something that fits the shape of the answers so far and commit to it.'
            : 'Short and human. Too vague and the table suspects you; too exact and you hand the impostor the question.',
          tone: impostor ? 'impostor' : 'crew',
        };
      }
      return {
        label: 'Answers',
        title: answeringId ? 'Listen to the answers' : 'Everybody has answered',
        body: impostor
          ? 'This is your evidence. Every answer narrows down what the question must have been.'
          : 'One of these people never saw the question. Watch for the answer that is a shade too general.',
        tone: impostor ? 'impostor' : 'neutral',
      };

    case 'DISCUSS':
      return {
        label: finalDefence ? 'Final defence' : 'Discuss',
        title: finalDefence ? 'Last words before the vote' : 'Argue it out — out loud',
        body: finalDefence
          ? 'The vote opens in a moment. Anyone still under suspicion should be talking right now.'
          : `Say whose answer sounds wrong and make them explain it.${
              suddenDeath ? ' Sudden Death: this is a short one.' : ''
            } Tapping a name below marks your suspicion — it is public as a count, costs nothing, and is not your vote.`,
        tone: 'neutral',
      };

    case 'DEFENCE':
      return {
        label: 'Safai',
        title: 'Two suspects get the floor',
        body: 'The two most suspected each get thirty seconds, uninterrupted. Everyone else listens — then the vote opens.',
        tone: 'neutral',
      };

    case 'VOTE':
      return {
        label: 'Vote',
        title: yourVote !== undefined ? 'Your vote is in' : 'Name the impostor',
        body:
          yourVote !== undefined
            ? `Waiting on the rest of the table — ${voted.length} of ${order.length} have voted.`
            : 'Pick the one you believe never saw the question. You cannot vote for yourself.',
        stakes: impostor
          ? 'You score 1 for every vote that lands on somebody else. Survive this and the round is yours.'
          : 'Name an impostor and you score 2. Every vote that misses hands the impostor a point.',
        tone: impostor ? 'impostor' : 'crew',
      };

    case 'REVEAL':
      return {
        label: 'Reveal',
        title: 'Who was lying, and who voted for whom',
        body: 'Every vote is public now. A caught impostor still gets one last shot at the round.',
        tone: 'neutral',
      };

    case 'STEAL': {
      const yours = view.you !== null && stealingIds.includes(view.you);
      return yours
        ? {
            label: 'Steal-back',
            title: 'You were caught — take it back',
            body: 'Three questions, one of them the real one. Pick it and the round is yours anyway.',
            stakes: 'Naming the real question is worth 3.',
            tone: 'impostor',
          }
        : {
            label: 'Steal-back',
            title: 'The impostor gets one last shot',
            body: 'They are looking at three questions, one of them real. If they name it, they take the round back.',
            tone: 'neutral',
          };
    }

    case 'ROUND_END':
      return {
        label: 'Round over',
        title: 'Points, with the working shown',
        body: 'The next round deals a new impostor and a new question. Roles are weighted random — being it once does not rule you out.',
        tone: 'neutral',
      };

    default:
      return null;
  }
}

const GUIDE_TONE: Record<Guide['tone'], string> = {
  crew: 'border-emerald-400/40 bg-emerald-400/5',
  impostor: 'border-rose-400/40 bg-rose-400/5',
  neutral: 'border-slate-700 bg-slate-900/70',
};

const GUIDE_LABEL_TONE: Record<Guide['tone'], string> = {
  crew: 'text-emerald-300',
  impostor: 'text-rose-300',
  neutral: 'text-amber-300',
};

export function PhaseGuide({
  view,
  yourTurn,
  finalDefence,
}: {
  view: ImpostorView;
  yourTurn: boolean;
  finalDefence: boolean;
}) {
  const guide = guideFor(view, yourTurn, finalDefence);
  if (!guide) return null;

  return (
    <div className={`rounded-2xl border px-3.5 py-3 sm:px-4 ${GUIDE_TONE[guide.tone]}`}>
      <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${GUIDE_LABEL_TONE[guide.tone]}`}>
        {guide.label}
      </p>
      <p className="mt-1 text-base font-bold leading-snug text-white sm:text-lg">{guide.title}</p>
      <p className="mt-1 text-sm leading-snug text-slate-300 sm:text-base">{guide.body}</p>
      {guide.stakes ? (
        <p className="mt-1.5 border-t border-white/10 pt-1.5 text-sm font-semibold text-amber-200">{guide.stakes}</p>
      ) : null}
    </div>
  );
}

/**
 * The rules, on the table rather than on the game's page.
 *
 * Shut by default and one tap from every screen, for the player who has the
 * gist but cannot remember what a Chaal is or what the steal-back pays.
 */
export function RulesSheet() {
  const RULES: Array<[string, string]> = [
    ['The point', 'Everyone answers the same question. One person never saw it. Crew win by voting them out; the impostor wins by surviving.'],
    ['Answering', 'One at a time, in an order that changes every round. The impostor is told the shape of the answer — "a number", "one food item" — never the question.'],
    ['Suspicion', 'During discussion, tapping a name marks who you suspect. Counts are public, who tapped whom is not, and it is not a vote.'],
    ['The vote', 'Name an impostor: +2. The impostor scores +1 for every vote that lands somewhere else.'],
    ['Steal-back', 'A caught impostor picks the real question out of three. Name it and take +3 anyway.'],
    ['Chaals', 'About half the rounds carry a twist — two impostors, one word each, no discussion, open votes, or no impostor at all. The strip at the top says which.'],
    ['Winning', 'One round per player, highest total wins. A tie at the top plays a Sudden Death round.'],
  ];

  return (
    <details className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4">
      <summary className={`${TAP} flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-white`}>
        <span aria-hidden="true">🕵️</span> How to play
        <span className="ml-auto text-xs font-normal text-slate-500">tap to open</span>
      </summary>
      <dl className="mt-2 flex flex-col gap-2.5">
        {RULES.map(([term, detail]) => (
          <div key={term}>
            <dt className="text-xs font-black uppercase tracking-wider text-amber-300">{term}</dt>
            <dd className="mt-0.5 text-sm leading-snug text-slate-300">{detail}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// ── The round's header ──────────────────────────────────────────────────────

/** A slim strip, not a card: the Chaal frames the round, it is not the round. */
export function ChaalBanner({ view }: { view: ImpostorView }) {
  const chaal = chaalById(view.round.chaal);

  if (view.round.suddenDeath) {
    return (
      <p className="rounded-xl border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-center text-xs text-rose-200">
        <span className="font-black uppercase tracking-wide text-rose-300">⚔️ Sudden Death</span>
        <span className="mx-1.5 text-rose-400/50">·</span>
        The top is tied. No Chaal, no steal-back.
      </p>
    );
  }
  if (!chaal) return null;

  return (
    <p className="rounded-xl border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-center text-xs text-amber-100">
      <span className="font-black uppercase tracking-wide text-amber-300">
        {chaal.emoji} {chaal.name}
      </span>
      <span className="mx-1.5 text-amber-400/50">·</span>
      {chaal.rule}
    </p>
  );
}

/**
 * The question, or — if you are the impostor — the hole where it should be.
 *
 * These two cards are the whole game, so they are the loudest thing on the
 * screen and deliberately the same size and shape. Somebody glancing across at
 * your phone should not be able to tell which one you are holding.
 */
export function QuestionCard({ view, compact }: { view: ImpostorView; compact?: boolean }) {
  const { question, format, youAreImpostor } = view.round;

  if (question) {
    return (
      <div
        className={`rounded-2xl border border-amber-300/40 bg-amber-400/10 text-center ${
          compact ? 'px-3 py-2.5' : 'p-4 sm:p-5'
        }`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
          {question.emoji} {CATEGORY_LABEL[question.category]}
        </p>
        <p
          className={`mt-1.5 font-bold leading-snug text-white ${
            compact ? 'text-sm' : 'text-lg sm:text-xl'
          }`}
        >
          {question.text}
        </p>
        {!compact ? <p className="mt-2 text-xs text-amber-200/70">{format.label}</p> : null}
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-rose-400/50 bg-rose-400/10 text-center ${
        compact ? 'px-3 py-2.5' : 'p-4 sm:p-5'
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-300">
        {youAreImpostor ? '🕵️ You are the impostor' : '👀 Watching'}
      </p>
      {/* The question, struck out. It keeps the crew card's shape — a glance
          across the table still cannot tell the two apart — and says what has
          been kept from you far faster than a sentence about it. */}
      <p
        aria-label={youAreImpostor ? 'The question is hidden from you' : 'You are not in this round'}
        className={`mt-1.5 select-none font-black leading-snug tracking-[0.1em] text-rose-300/40 ${
          compact ? 'text-sm' : 'text-lg sm:text-xl'
        }`}
      >
        ███████ ████ ██████████ ███
      </p>
      <p
        className={`mt-2 rounded-xl bg-slate-950/70 px-3 py-2 font-bold text-rose-100 ${
          compact ? 'text-xs' : 'text-sm sm:text-base'
        }`}
      >
        {youAreImpostor ? `All you know: ${format.label}` : format.label}
      </p>
      {!compact && youAreImpostor ? (
        <p className="mt-2 text-sm text-rose-200/70">
          Read the answers, work out what was asked, and answer in the same shape. Do not be the one who sounds wrong.
        </p>
      ) : null}
    </div>
  );
}

// ── Role ────────────────────────────────────────────────────────────────────

export function RoleCard({ view }: { view: ImpostorView }) {
  const impostor = view.round.youAreImpostor;
  const playing = view.you !== null && view.round.order.includes(view.you);

  // Somebody who arrived mid-game is not in this round at all. Telling them
  // "you are crew, you will see the question" and then showing them nothing is
  // worse than saying plainly that they are sitting this one out.
  if (!playing) {
    return (
      <div className="flex min-h-[15rem] flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center sm:min-h-[18rem] sm:p-8">
        <p className="text-5xl">👀</p>
        <p className="mt-3 text-2xl font-black text-slate-300 sm:text-3xl">You are watching</p>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          This round started without you. You are dealt in from the next one.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-[15rem] flex-col items-center justify-center rounded-2xl border p-6 text-center sm:min-h-[18rem] sm:p-8 ${
        impostor ? 'border-rose-400/50 bg-rose-400/10' : 'border-emerald-400/40 bg-emerald-400/10'
      }`}
    >
      <p className="text-5xl">{impostor ? '🕵️' : '✅'}</p>
      <p
        className={`mt-3 text-2xl font-black sm:text-3xl ${
          impostor ? 'text-rose-300' : 'text-emerald-300'
        }`}
      >
        {impostor ? 'You are the impostor' : 'You are crew'}
      </p>
      <p className="mt-2 max-w-sm text-sm text-slate-300">
        {impostor
          ? 'You will not see the question — only what shape the answer takes.'
          : 'You will see the question. Prove you saw it, without giving it away.'}
      </p>
    </div>
  );
}

// ── Answers ─────────────────────────────────────────────────────────────────

export function AnswerBoard({ view, people }: { view: ImpostorView; people: Person[] }) {
  const { order, answers, answeringId } = view.round;
  const answerOf = new Map(answers.map((answer) => [answer.playerId, answer] as const));

  return (
    <div className="impostor-board">
      {order.map((id, index) => {
        const answer = answerOf.get(id);
        const turn = answeringId === id;
        const you = view.you === id;
        return (
          <div
            key={id}
            className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition sm:gap-2.5 sm:px-3 ${
              turn
                ? 'border-amber-300/60 bg-amber-400/10'
                : answer
                  ? 'border-slate-800 bg-slate-950/60'
                  : 'border-slate-800/60 bg-slate-950/30 opacity-50'
            }`}
          >
            <span className="impostor-score-rank w-3 shrink-0 text-center text-[10px] font-bold tabular-nums text-slate-600">
              {index + 1}
            </span>
            <Avatar
              avatar={personIn(people, id)?.avatar ?? null}
              userKey={id}
              name={nameOf(people, id)}
              className="h-7 w-7 shrink-0"
            />
            <span
              className={`min-w-0 flex-1 truncate text-sm ${
                you ? 'font-bold text-amber-200' : 'font-medium text-slate-300'
              }`}
            >
              {nameOf(people, id)}
            </span>
            <span className="min-w-0 max-w-[50%] shrink-0 text-right">
              {answer ? (
                <AnswerText answer={answer} people={people} />
              ) : turn ? (
                <span className="text-xs italic text-amber-300">answering…</span>
              ) : (
                <span className="text-sm text-slate-700">—</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A `player` answer is an id, so it is printed as a name rather than a uuid. */
function AnswerText({ answer, people }: { answer: Answer; people: Person[] }) {
  if (answer.timedOut) {
    return <span className="text-xs italic text-slate-600">no answer</span>;
  }
  const named = personIn(people, answer.text);
  return (
    <span className="block truncate text-base font-bold text-white">
      {named ? named.name : answer.text}
    </span>
  );
}

/**
 * The box you answer in, in the shape the question asked for.
 *
 * A `player` question is picked rather than typed — partly so nobody loses a
 * round to a spelling, and mostly because a typed name is a tell: the impostor
 * who writes "rahul" when everybody else wrote "Rahul" has given themselves
 * away for a reason that has nothing to do with the game.
 */
export function AnswerInput({
  format,
  people,
  order,
  you,
  oneWord,
  onAnswer,
}: {
  format: AnswerFormat;
  people: Person[];
  order: string[];
  you: string | null;
  oneWord: boolean;
  onAnswer: (text: string) => void;
}) {
  const [text, setText] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    onAnswer(text.trim());
    setText('');
  };

  const hint = (
    <p className="mb-2 text-center text-xs font-semibold text-amber-300">
      {format.label}
      {oneWord ? ' · one word only' : ''}
    </p>
  );

  if (format.kind === 'player') {
    return (
      <div>
        {hint}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {order
            .filter((id) => id !== you)
            .map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onAnswer(id)}
                className={`${TAP} flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-left transition active:scale-[0.98] hover:border-amber-300 hover:bg-amber-400/10`}
              >
                <Avatar
                  avatar={personIn(people, id)?.avatar ?? null}
                  userKey={id}
                  name={nameOf(people, id)}
                  className="h-6 w-6 shrink-0"
                />
                <span className="min-w-0 truncate text-sm font-medium text-white">{nameOf(people, id)}</span>
              </button>
            ))}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {hint}
      <div className="flex gap-2">
        <input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          inputMode={format.kind === 'number' ? 'numeric' : 'text'}
          enterKeyHint="send"
          maxLength={60}
          placeholder={format.placeholder ?? 'your answer…'}
          /* 16px on the phone, or Safari zooms the page on focus. */
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-base text-white outline-none placeholder:text-slate-600 focus:border-amber-300"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className={`${TAP} shrink-0 rounded-xl bg-amber-400 px-5 text-sm font-black uppercase text-amber-950 transition active:scale-[0.98] hover:bg-amber-300 disabled:opacity-40`}
        >
          Answer
        </button>
      </div>
    </form>
  );
}

// ── Discussion ──────────────────────────────────────────────────────────────

/**
 * Tap the one who smells wrong.
 *
 * It scores nothing and binds nobody — it is a live read on the room, and the
 * thing Safai picks its two defendants from. Only the counts are public.
 */
export function SuspicionRow({
  view,
  people,
  onSuspect,
}: {
  view: ImpostorView;
  people: Person[];
  onSuspect: (id: string | null) => void;
}) {
  const { order, suspicion, yourSuspicion } = view.round;
  return (
    <div>
      <p className="mb-2 text-center text-sm text-slate-300">
        Who smells wrong? Tap to say so — it is not a vote.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {order
          .filter((id) => id !== view.you)
          .map((id) => {
            const picked = yourSuspicion === id;
            const count = suspicion[id] ?? 0;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSuspect(picked ? null : id)}
                className={`${TAP} flex items-center gap-2 rounded-xl border px-2.5 py-2 transition active:scale-[0.98] ${
                  picked
                    ? 'border-amber-300/70 bg-amber-400/15'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
                }`}
              >
                <Avatar
                  avatar={personIn(people, id)?.avatar ?? null}
                  userKey={id}
                  name={nameOf(people, id)}
                  className="h-6 w-6 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate text-left text-sm text-white">
                  {nameOf(people, id)}
                </span>
                {count > 0 ? (
                  <span className="shrink-0 rounded-full bg-amber-400/25 px-1.5 text-xs font-bold tabular-nums text-amber-200">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
      </div>
    </div>
  );
}

export function DefencePanel({ view, people }: { view: ImpostorView; people: Person[] }) {
  const { defendingId, defendants } = view.round;
  const position = defendants.indexOf(defendingId ?? '') + 1;
  const yours = defendingId === view.you;

  return (
    <div className="rounded-2xl border border-amber-300/40 bg-amber-400/5 p-5 text-center sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
        ⚖️ Safai · {position} of {defendants.length}
      </p>
      <div className="mt-3 flex items-center justify-center gap-3">
        <Avatar
          avatar={personIn(people, defendingId)?.avatar ?? null}
          userKey={defendingId ?? ''}
          name={nameOf(people, defendingId)}
          className="h-12 w-12"
        />
        <p className="text-2xl font-black text-white">{nameOf(people, defendingId)}</p>
      </div>
      <p className="mt-3 text-sm text-amber-100/80">
        {yours ? 'The floor is yours. Nobody interrupts.' : 'They have the floor. Let them talk.'}
      </p>
    </div>
  );
}

// ── Voting ──────────────────────────────────────────────────────────────────

export function VotePanel({
  view,
  people,
  onVote,
}: {
  view: ImpostorView;
  people: Person[];
  onVote: (id: string | null) => void;
}) {
  const { order, votes, voted, yourVote, chaal } = view.round;
  const open = chaal === 'khulla-vote';
  const sabSaaf = chaal === 'sab-saaf';
  const decided = yourVote !== undefined;
  const locked = decided && !open;

  const tally = new Map<string, number>();
  if (votes) {
    Object.values(votes).forEach((target) => {
      if (target) tally.set(target, (tally.get(target) ?? 0) + 1);
    });
  }

  return (
    <div>
      <p className="mb-1 text-center text-base font-bold text-white sm:text-lg">
        {locked ? 'Your vote is in.' : 'Who never saw the question?'}
      </p>
      <p className="mb-2.5 text-center text-xs text-slate-400">
        {open ? 'Khulla Vote — public, and you can still change it.' : `${voted.length} of ${order.length} voted`}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {order
          .filter((id) => id !== view.you)
          .map((id) => {
            const picked = yourVote === id;
            const count = tally.get(id) ?? 0;
            return (
              <button
                key={id}
                type="button"
                disabled={locked}
                onClick={() => onVote(id)}
                className={`${TAP} flex items-center gap-2 rounded-xl border px-2.5 py-2 transition active:scale-[0.98] disabled:cursor-not-allowed ${
                  picked
                    ? 'border-rose-400/70 bg-rose-400/15'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-600 disabled:opacity-40'
                }`}
              >
                <Avatar
                  avatar={personIn(people, id)?.avatar ?? null}
                  userKey={id}
                  name={nameOf(people, id)}
                  className="h-7 w-7 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-white">
                  {nameOf(people, id)}
                </span>
                {open && count > 0 ? (
                  <span className="shrink-0 rounded-full bg-rose-400/25 px-1.5 text-xs font-bold tabular-nums text-rose-200">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
      </div>

      {/* Only Sab Saaf allows it, and only Sab Saaf shows it — an unused NOBODY
          button every round would give the Chaal away the moment it appeared. */}
      {sabSaaf ? (
        <button
          type="button"
          disabled={locked}
          onClick={() => onVote(null)}
          className={`${TAP} mt-2 w-full rounded-xl border px-3 py-2.5 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
            yourVote === null
              ? 'border-emerald-400/70 bg-emerald-400/15 text-emerald-200'
              : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600'
          }`}
        >
          😇 Nobody — everyone saw it
        </button>
      ) : null}
    </div>
  );
}

// ── Reveal and steal ────────────────────────────────────────────────────────

export function RevealPanel({ view, people }: { view: ImpostorView; people: Person[] }) {
  const { votes, impostorIds, chaal } = view.round;
  const impostors = impostorIds ?? [];
  const sabSaaf = chaal === 'sab-saaf';

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`rounded-2xl border p-5 text-center sm:p-6 ${
          sabSaaf ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-rose-400/50 bg-rose-400/10'
        }`}
      >
        <p className="text-4xl">{sabSaaf ? '😇' : '🚨'}</p>
        {sabSaaf ? (
          <>
            <p className="mt-2 text-xl font-black text-emerald-300 sm:text-2xl">There was no impostor</p>
            <p className="mt-1 text-sm text-emerald-100/80">Everybody saw the question. Everybody.</p>
          </>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              {impostors.map((id) => (
                <span key={id} className="flex items-center gap-2">
                  <Avatar
                    avatar={personIn(people, id)?.avatar ?? null}
                    userKey={id}
                    name={nameOf(people, id)}
                    className="h-10 w-10"
                  />
                  <span className="text-xl font-black text-white sm:text-2xl">{nameOf(people, id)}</span>
                </span>
              ))}
            </div>
            <p className="mt-2 text-sm font-semibold text-rose-300">
              {impostors.length > 1 ? 'were the impostors' : 'was the impostor'}
            </p>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          The votes
        </p>
        <div className="mt-2.5 flex flex-col gap-1">
          {Object.entries(votes ?? {}).map(([voter, target]) => {
            const right = target !== null && impostors.includes(target);
            return (
              <p key={voter} className="flex items-center justify-center gap-1.5 text-sm">
                <span className="max-w-[40%] truncate font-semibold text-white">{nameOf(people, voter)}</span>
                <span className="text-slate-700">→</span>
                <span
                  className={`max-w-[40%] truncate font-medium ${
                    target === null ? 'text-emerald-300' : right ? 'text-emerald-300' : 'text-slate-400'
                  }`}
                >
                  {target === null ? 'Nobody' : nameOf(people, target)}
                </span>
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The steal-back: three questions, one of them real.
 *
 * Only a caught impostor is sent the choices, so everybody else gets the
 * waiting screen — which is half the drama. The table watching somebody decide
 * is the reason this happens in the open.
 */
export function StealPanel({
  view,
  people,
  onSteal,
}: {
  view: ImpostorView;
  people: Person[];
  onSteal: (questionId: string) => void;
}) {
  const { stealChoices, stealingIds } = view.round;
  const [picked, setPicked] = useState<string | null>(null);
  const who = stealingIds.map((id) => nameOf(people, id)).join(' and ');

  if (!stealChoices) {
    return (
      <div className="rounded-2xl border border-amber-300/40 bg-amber-400/5 p-6 text-center sm:p-8">
        <p className="text-4xl">🃏</p>
        <p className="mt-2 text-xl font-black text-amber-300">Steal the round</p>
        <p className="mt-2 text-sm text-slate-300">
          {who} got caught — and {stealingIds.length > 1 ? 'are' : 'is'} picking the real question out of
          three.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-300/50 bg-amber-400/5 p-4 sm:p-5">
      <p className="text-center text-4xl">🃏</p>
      <p className="mt-1 text-center text-xl font-black text-amber-300">Steal the round</p>
      <p className="mt-1 text-center text-sm text-slate-300">
        You were caught. Name the real question — it is worth +3.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {stealChoices.map((choice, index) => (
          <button
            key={choice.id}
            type="button"
            disabled={picked !== null}
            onClick={() => {
              setPicked(choice.id);
              onSteal(choice.id);
            }}
            className={`${TAP} flex items-start gap-2.5 rounded-xl border px-3 py-3 text-left text-sm transition active:scale-[0.99] disabled:cursor-not-allowed ${
              picked === choice.id
                ? 'border-amber-300 bg-amber-400/20 text-white'
                : 'border-slate-700 bg-slate-950/70 text-slate-200 hover:border-amber-300/60 disabled:opacity-40'
            }`}
          >
            <span className="shrink-0 font-black text-amber-400">{'ABC'[index]}</span>
            <span className="min-w-0">{choice.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Results ─────────────────────────────────────────────────────────────────

export function RoundResultCard({ result, people }: { result: RoundResult; people: Person[] }) {
  const chaal = chaalById(result.chaal);
  const scored = [...Object.entries(result.points)].sort((a, b) => b[1].total - a[1].total);

  /* How the round actually ended, said in three words before any arithmetic.
     The points below explain themselves line by line, but only once you know
     whether the table won — so that goes first and goes loudest. */
  const listed = (ids: string[]) => ids.map((id) => nameOf(people, id)).join(' and ');
  const escaped = result.impostorIds.filter((id) => !result.caughtIds.includes(id));
  const verdict =
    result.impostorIds.length === 0
      ? { stamp: '😇 Nobody was lying', line: 'A Sab Saaf round — everybody saw the question.', tone: 'crew' as const }
      : result.stoleIds.length
        ? {
            stamp: '🃏 Stolen back',
            line: `${listed(result.stoleIds)} got caught, then named the real question.`,
            tone: 'impostor' as const,
          }
        : result.caughtIds.length
          ? { stamp: '🚨 Caught', line: `The table found ${listed(result.caughtIds)}.`, tone: 'crew' as const }
          : {
              stamp: '🕵️ Got away with it',
              line: `${listed(escaped)} never saw the question, and nobody pinned it on them.`,
              tone: 'impostor' as const,
            };

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`rounded-2xl border-2 border-dashed px-4 py-3 text-center ${
          verdict.tone === 'crew' ? 'border-emerald-400/60 bg-emerald-400/10' : 'border-rose-400/60 bg-rose-400/10'
        }`}
      >
        <p
          className={`text-xl font-black uppercase tracking-wide sm:text-2xl ${
            verdict.tone === 'crew' ? 'text-emerald-300' : 'text-rose-300'
          }`}
        >
          {verdict.stamp}
        </p>
        <p className="mt-1 text-sm text-slate-300 sm:text-base">{verdict.line}</p>
      </div>

      <div className="rounded-2xl border border-amber-300/40 bg-amber-400/10 p-4 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
          The question was
        </p>
        <p className="mt-2 text-base font-bold leading-snug text-white sm:text-lg">{result.question.text}</p>
        {chaal ? (
          <p className="mt-2 text-xs text-amber-200/70">
            {chaal.emoji} {chaal.name}
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Points
        </p>
        <div className="mt-3 flex flex-col gap-2.5">
          {scored.map(([playerId, breakdown]) => (
            <div key={playerId} className="flex items-start gap-2.5">
              <Avatar
                avatar={personIn(people, playerId)?.avatar ?? null}
                userKey={playerId}
                name={nameOf(people, playerId)}
                className="h-7 w-7 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-white">
                    {nameOf(people, playerId)}
                    {result.impostorIds.includes(playerId) ? (
                      <span className="ml-1.5 rounded bg-rose-400/20 px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-rose-300">
                        Impostor
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`shrink-0 text-sm font-black tabular-nums ${
                      breakdown.total > 0 ? 'text-emerald-300' : 'text-slate-600'
                    }`}
                  >
                    {breakdown.total > 0 ? `+${breakdown.total}` : '0'}
                  </span>
                </p>
                {breakdown.lines.map((line) => (
                  <p key={line.label} className="text-xs leading-snug text-slate-400">
                    {line.label} · +{line.value}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Scoreboard({ view, people }: { view: ImpostorView; people: Person[] }) {
  const ranked = [...view.players].sort((a, b) => b.score - a.score);

  return (
    <section className="impostor-scores-card rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <div className="impostor-scores-heading flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Scores</h2>
        <span className="text-[11px] text-slate-500">
          Round {view.round.number} of {view.totalRounds}
        </span>
      </div>

      <div className="impostor-scores mt-3 flex flex-col gap-1.5">
        {ranked.map((player, index) => (
          <div
            key={player.id}
            className={`impostor-score-row flex items-center gap-2 ${
              player.id === view.you ? 'bg-amber-400/10' : ''
            }`}
          >
            <span className="impostor-score-rank w-4 shrink-0 text-center text-[11px] font-bold tabular-nums text-slate-600">
              {index + 1}
            </span>
            <Avatar
              avatar={personIn(people, player.id)?.avatar ?? null}
              userKey={player.id}
              name={player.name}
              className="h-6 w-6 shrink-0"
            />
            <span
              className={`impostor-score-name min-w-0 flex-1 truncate text-sm ${
                player.id === view.you ? 'font-bold text-amber-200' : 'text-slate-300'
              }`}
            >
              {player.name}
            </span>
            <span className="shrink-0 text-sm font-black tabular-nums text-white">{player.score}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FinalResults({
  view,
  people,
  isAdmin,
  onReset,
}: {
  view: ImpostorView;
  people: Person[];
  isAdmin: boolean;
  onReset: () => void;
}) {
  const final = view.final;
  if (!final) return null;
  const top = final.standings[0]?.score ?? 0;
  const winners = final.standings.filter((standing) => standing.score === top);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-amber-300/40 bg-amber-400/10 p-6 text-center">
        <p className="text-5xl">🏆</p>
        <p className="mt-2 text-2xl font-black text-white sm:text-3xl">
          {winners.map((winner) => winner.name).join(' & ')}
        </p>
        <p className="mt-1 text-sm text-amber-200/80">
          {final.shared ? 'Shared it, even after Sudden Death.' : `${top} points`}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4">
        {final.standings.map((standing, index) => (
          <div key={standing.playerId} className="flex items-center gap-2.5 py-1.5">
            <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-slate-600">
              {index + 1}
            </span>
            <Avatar
              avatar={personIn(people, standing.playerId)?.avatar ?? null}
              userKey={standing.playerId}
              name={standing.name}
              className="h-8 w-8 shrink-0"
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{standing.name}</span>
            <span className="shrink-0 text-base font-black tabular-nums text-amber-300">{standing.score}</span>
          </div>
        ))}
      </div>

      {final.awards.length ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <h3 className="text-sm font-semibold text-white">The night in numbers</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {final.awards.map((award) => (
              <div key={award.title} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                <p className="text-xs font-semibold text-slate-400">
                  {award.emoji} {award.title}
                </p>
                <p className="mt-0.5 truncate text-sm font-bold text-white">{nameOf(people, award.playerId)}</p>
                {award.detail ? <p className="text-[11px] text-slate-500">{award.detail}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isAdmin ? (
        <button
          type="button"
          onClick={onReset}
          className={`${TAP} w-full rounded-xl bg-amber-400 px-4 py-3 text-base font-black uppercase tracking-wide text-amber-950 transition hover:bg-amber-300`}
        >
          Back to the lobby
        </button>
      ) : null}
    </div>
  );
}

// ── Reactions ───────────────────────────────────────────────────────────────

export function ReactionBar({ onReact }: { onReact: (emoji: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-0.5">
      {IMPOSTOR_REACTIONS.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          title={reaction.label}
          aria-label={reaction.label}
          onClick={() => onReact(reaction.emoji)}
          className="rounded-lg px-2 py-1.5 text-xl leading-none transition active:scale-90 hover:bg-slate-800"
        >
          {reaction.emoji}
        </button>
      ))}
    </div>
  );
}

/** Emoji that float up the screen when somebody reacts. */
export function FloatingReactions({
  reactions,
}: {
  reactions: Array<{ id: number; emoji: string; left: number }>;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {reactions.map((reaction) => (
        <span
          key={reaction.id}
          className="impostor-float absolute bottom-24 animate-[imp-float_2.2s_ease-out_forwards] text-4xl"
          style={{ left: `${reaction.left}%` }}
        >
          {reaction.emoji}
        </span>
      ))}
      <style>{`@keyframes imp-float {
        0% { transform: translateY(0) scale(0.6); opacity: 0; }
        20% { transform: translateY(-20px) scale(1.1); opacity: 1; }
        100% { transform: translateY(-220px) scale(1); opacity: 0; }
      }`}</style>
    </div>
  );
}

/** A short-lived banner for whatever just happened. */
export function Toast({ text }: { text: string | null }) {
  const [shown, setShown] = useState(text);
  useEffect(() => setShown(text), [text]);
  if (!shown) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4">
      <p className="rounded-full bg-slate-900/95 px-4 py-2 text-center text-sm font-semibold text-white ring-1 ring-slate-700">
        {shown}
      </p>
    </div>
  );
}
