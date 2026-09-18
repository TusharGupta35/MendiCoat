'use client';

import { type FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { CHAALS } from './chaals';
import type { Mode } from './types';

export interface ImpostorRoomPayload {
  minPlayers: number;
  maxPlayers: number;
  mode: Mode;
  started: boolean;
  admin: { id: string; name: string; isHost: boolean } | null;
  players: Array<{
    id: string;
    name: string;
    avatar: string | null;
    title: string | null;
    isOnline: boolean;
    questions: number;
  }>;
  yourQuestions: string[];
}

const MODES: Array<{ id: Mode; name: string; emoji: string; blurb: string }> = [
  { id: 'classic', name: 'Classic', emoji: '🕵️', blurb: 'The written question bank, Chaals about half the time.' },
  { id: 'friends', name: 'Friends', emoji: '🫂', blurb: "The bank plus the table's own questions, mixed in." },
  { id: 'chaos', name: 'Chaos', emoji: '💥', blurb: 'Almost every round has a Chaal. Nothing is normal.' },
  { id: 'quick', name: 'Quick', emoji: '⚡', blurb: 'Same game, shorter arguments. Good for a school night.' },
];

/**
 * Before the first round: who is here, the mode, and the table's own questions.
 *
 * The questions get the room's attention for the same reason Doodle Dhamaka's
 * friend words do — a question about the five of you is worth ten generic ones,
 * and it is the easiest thing on this screen to skip past.
 */
export function ImpostorLobby({
  room,
  playerId,
  onAddQuestion,
  onRemoveQuestion,
  onMode,
  onStart,
}: {
  room: ImpostorRoomPayload;
  playerId: string;
  onAddQuestion: (text: string, done: () => void) => void;
  onRemoveQuestion: (text: string) => void;
  onMode: (mode: Mode) => void;
  onStart: () => void;
}) {
  const [question, setQuestion] = useState('');
  const isAdmin = room.admin?.id === playerId;
  const here = room.players.filter((player) => player.isOnline).length;
  const short = Math.max(0, room.minPlayers - here);
  const total = room.players.reduce((sum, player) => sum + player.questions, 0);
  const full = room.yourQuestions.length >= 5;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim()) return;
    onAddQuestion(question, () => setQuestion(''));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Who is here</h2>
          <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold tabular-nums text-amber-300">
            {here}/{room.maxPlayers}
          </span>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {room.players.map((player) => (
            <div
              key={player.id}
              className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
            >
              <span className="relative shrink-0">
                <Avatar avatar={player.avatar} userKey={player.id} name={player.name} className="h-8 w-8" />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-slate-950 ${
                    player.isOnline ? 'bg-emerald-400' : 'bg-slate-600'
                  }`}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{player.name}</span>
                <span className="block truncate text-[10px] text-slate-500">
                  {room.admin?.id === player.id ? (room.admin.isHost ? 'Host · ' : 'Acting host · ') : ''}
                  {player.questions
                    ? `${player.questions} question${player.questions === 1 ? '' : 's'}`
                    : 'no questions yet'}
                </span>
              </span>
            </div>
          ))}
        </div>

        {/* No bots: a bot cannot invent an answer and then defend it. */}
        {short > 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-700 px-3 py-2.5 text-center text-sm text-slate-400">
            Need <span className="font-bold text-amber-300">{short} more</span> to start — share the code above.
          </p>
        ) : null}

        <div className="mt-4">
          {isAdmin ? (
            <button
              type="button"
              onClick={onStart}
              disabled={short > 0}
              className="w-full rounded-xl bg-amber-400 px-4 py-3 text-base font-black uppercase tracking-wide text-amber-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              🕵️ Start Impostor
            </button>
          ) : (
            <p className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-center text-sm text-slate-400">
              Waiting for <span className="font-semibold text-slate-200">{room.admin?.name ?? 'the host'}</span> to start
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-white">How you are playing</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {MODES.map((mode) => {
            const picked = room.mode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                disabled={!isAdmin}
                onClick={() => onMode(mode.id)}
                className={`rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed ${
                  picked
                    ? 'border-amber-300/60 bg-amber-400/15'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 disabled:hover:border-slate-800'
                }`}
              >
                <span className="block text-sm font-semibold text-white">
                  {mode.emoji} {mode.name}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{mode.blurb}</span>
              </button>
            );
          })}
        </div>
        {!isAdmin ? (
          <p className="mt-2 text-[11px] text-slate-500">Only {room.admin?.name ?? 'the host'} can change this.</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-amber-300/30 bg-slate-900/80 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">🫂 Your questions</h2>
          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">{total} in the pot</span>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Questions about each other beat any we could write.
          <span className="italic text-slate-300"> &ldquo;Who would forget a birthday first?&rdquo;</span> Used in
          Friends mode.
        </p>

        <form onSubmit={submit} className="mt-3 flex gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={120}
            placeholder="Who is most likely to…"
            disabled={full}
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base text-white outline-none placeholder:text-slate-500 focus:border-amber-300 disabled:opacity-50 sm:text-sm"
          />
          <button
            type="submit"
            disabled={!question.trim() || full}
            className="shrink-0 rounded-xl bg-amber-400 px-4 text-sm font-bold text-amber-950 transition hover:bg-amber-300 disabled:opacity-40"
          >
            Add
          </button>
        </form>

        {room.yourQuestions.length ? (
          <div className="mt-3 flex flex-col gap-1.5">
            {room.yourQuestions.map((text) => (
              <span
                key={text}
                className="flex items-start gap-1 rounded-xl bg-amber-300/10 py-1.5 pl-3 pr-1 text-sm text-amber-100"
              >
                <span className="min-w-0 flex-1">{text}</span>
                <button
                  type="button"
                  onClick={() => onRemoveQuestion(text)}
                  aria-label={`Remove ${text}`}
                  className="shrink-0 rounded-full p-0.5 text-amber-200/70 transition hover:bg-amber-300/20 hover:text-amber-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-[11px] text-slate-500">
          Up to 5 each, and only you can see yours — recognising a question would tell you you are not the impostor.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-white">💥 What might happen</h2>
        <p className="mt-1 text-sm text-slate-400">
          About half the rounds are plain. The rest draw one of these, and nobody is told which until it lands.
        </p>
        <div className="mt-3 flex flex-col gap-1.5">
          {CHAALS.map((chaal) => (
            <span
              key={chaal.id}
              className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
            >
              <span className="font-semibold text-white">
                {chaal.emoji} {chaal.name}
              </span>
              <span className="mt-0.5 block text-slate-400">{chaal.rule}</span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
