'use client';

import { type FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { DHAMAKAS } from './dhamakas';

export interface DoodleRoomPayload {
  minPlayers: number;
  maxPlayers: number;
  friendWordsOn: boolean;
  started: boolean;
  admin: { id: string; name: string; isHost: boolean } | null;
  players: Array<{
    id: string;
    name: string;
    avatar: string | null;
    title: string | null;
    isOnline: boolean;
    words: number;
  }>;
  yourWords: string[];
}

/**
 * Before the first round: who is here, the group's own words, and the button.
 *
 * Friend words are the part of this screen that matters most and is easiest to
 * skip, so they get the room's attention: it is what turns a generic drawing
 * game into one about these particular people.
 */
export function Lobby({
  room,
  playerId,
  onAddWord,
  onRemoveWord,
  onToggleFriendWords,
  onStart,
}: {
  room: DoodleRoomPayload;
  playerId: string;
  onAddWord: (text: string, done: () => void) => void;
  onRemoveWord: (text: string) => void;
  onToggleFriendWords: (on: boolean) => void;
  onStart: () => void;
}) {
  const [word, setWord] = useState('');
  const isAdmin = room.admin?.id === playerId;
  const here = room.players.filter((player) => player.isOnline).length;
  const short = Math.max(0, room.minPlayers - here);
  const totalWords = room.players.reduce((sum, player) => sum + player.words, 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!word.trim()) return;
    onAddWord(word, () => setWord(''));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Who is here</h2>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold tabular-nums text-amber-300">
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
                  {player.words ? `${player.words} secret word${player.words === 1 ? '' : 's'}` : 'no words yet'}
                </span>
              </span>
            </div>
          ))}
        </div>

        {/* Bots cannot draw or guess a drawing, so a table needs real people. */}
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
              className="w-full rounded-xl bg-amber-500 px-4 py-3 text-base font-black uppercase tracking-wide text-amber-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              🎨 Start Doodle Dhamaka
            </button>
          ) : (
            <p className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-center text-sm text-slate-400">
              Waiting for <span className="font-semibold text-slate-200">{room.admin?.name ?? 'the host'}</span> to start
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-amber-300/30 bg-slate-900/80 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">🫂 Friend words</h2>
          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">{totalWords} in the pot</span>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Inside jokes, places, each other. They stay secret and turn up as prompts — someone will have to draw
          <span className="italic text-slate-300"> &ldquo;Rahul&rsquo;s bike&rdquo;</span>.
        </p>

        <form onSubmit={submit} className="mt-3 flex gap-2">
          <input
            value={word}
            onChange={(event) => setWord(event.target.value)}
            maxLength={40}
            placeholder="Goa trip, that chai shop…"
            disabled={room.yourWords.length >= 5}
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base text-white outline-none placeholder:text-slate-500 focus:border-amber-400 disabled:opacity-50 sm:text-sm"
          />
          <button
            type="submit"
            disabled={!word.trim() || room.yourWords.length >= 5}
            className="shrink-0 rounded-xl bg-amber-500 px-4 text-sm font-bold text-amber-950 transition hover:bg-amber-400 disabled:opacity-40"
          >
            Add
          </button>
        </form>

        {room.yourWords.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {room.yourWords.map((text) => (
              <span
                key={text}
                className="flex items-center gap-1 rounded-full bg-amber-400/15 py-1 pl-3 pr-1 text-sm text-amber-100"
              >
                {text}
                <button
                  type="button"
                  onClick={() => onRemoveWord(text)}
                  aria-label={`Remove ${text}`}
                  className="rounded-full p-0.5 text-amber-200/70 transition hover:bg-amber-400/20 hover:text-amber-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-[11px] text-slate-500">
          Up to 5 each. Only you can see yours.
        </p>

        <label className="mt-4 flex items-center justify-between gap-3 border-t border-slate-800 pt-3 text-sm text-slate-300">
          Use friend words this game
          <button
            type="button"
            role="switch"
            aria-checked={room.friendWordsOn}
            disabled={!isAdmin}
            onClick={() => onToggleFriendWords(!room.friendWordsOn)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${
              room.friendWordsOn ? 'bg-amber-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                room.friendWordsOn ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </label>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 lg:col-span-2">
        <h2 className="text-lg font-semibold text-white">💥 What might happen</h2>
        <p className="mt-1 text-sm text-slate-400">
          Every round draws a Dhamaka. Every fourth round draws two. The final round draws three.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DHAMAKAS.map((dhamaka) => (
            <span
              key={dhamaka.id}
              title={dhamaka.rule}
              className="rounded-full border border-slate-700 bg-slate-950/60 px-2.5 py-1 text-xs text-slate-300"
            >
              {dhamaka.emoji} {dhamaka.name}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
