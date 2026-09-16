'use client';

import { useEffect, useRef, useState } from 'react';
import { Eraser, Lock, Trash2, Undo2 } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { COMBOS, PALETTE, dhamakaById } from './dhamakas';
import { DOODLE_CHAT_EMOJIS } from './reactions';
import type { Award, DhamakaId, DoodlePlayer, DoodleView, FeedEntry, Prompt, RoundResult } from './types';
import { DIFFICULTY_LABEL } from './words';

/**
 * The pieces of a Doodle Dhamaka table. Each one draws what it is given and
 * owns nothing: the room client holds the socket and the state, and hands these
 * exactly what they need to show.
 */

export interface SeatInfo {
  id: string;
  name: string;
  avatar: string | null;
  isOnline: boolean;
}

const DIFFICULTY_STYLE: Record<Prompt['difficulty'], string> = {
  easy: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200',
  medium: 'border-sky-400/40 bg-sky-500/10 text-sky-200',
  hard: 'border-violet-400/40 bg-violet-500/10 text-violet-200',
  dhamaka: 'border-rose-400/50 bg-rose-500/10 text-rose-200',
  friends: 'border-amber-400/50 bg-amber-500/10 text-amber-200',
};

const countTitle = (count: number) =>
  count >= 3 ? '☢️ Grand Dhamaka' : count === 2 ? '💥 Double Dhamaka' : '💥 Dhamaka';

// ── Dhamakas ────────────────────────────────────────────────────────────────

/** The round's rules as small chips, each explaining itself on tap or hover. */
export function DhamakaChips({ ids }: { ids: DhamakaId[] }) {
  const [open, setOpen] = useState<DhamakaId | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ids.map((id) => {
        const dhamaka = dhamakaById(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => setOpen(open === id ? null : id)}
            title={dhamaka.rule}
            className="group relative flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-100 transition hover:bg-rose-500/25"
          >
            <span aria-hidden="true">{dhamaka.emoji}</span>
            {dhamaka.name}
            {open === id ? (
              <span className="absolute left-0 top-full z-40 mt-1 w-56 rounded-lg border border-slate-700 bg-slate-950 p-2 text-left text-xs font-normal text-slate-200 shadow-xl">
                {dhamaka.rule}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Persistent reminder of the rules currently affecting the round. */
export function ActiveDhamakas({ ids, combo }: { ids: DhamakaId[]; combo?: string }) {
  return (
    <div className="rounded-xl border border-rose-400/30 bg-rose-500/[0.08] px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-rose-200 sm:text-[10px] sm:tracking-[0.18em]">💥 This round</span>
        {combo ? (
          <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase text-amber-950">
            {combo}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
        {ids.map((id) => {
          const dhamaka = dhamakaById(id);
          return (
            <div key={id} className="flex min-w-0 items-start gap-1.5 rounded-lg bg-slate-950/35 px-2 py-1.5">
              <span className="shrink-0 text-sm" aria-hidden="true">{dhamaka.emoji}</span>
              <p className="min-w-0 text-xs leading-snug text-rose-50 sm:text-[11px]">
                <span className="font-black">{dhamaka.name}</span>
                <span className="text-rose-100/65"> — {dhamaka.rule}</span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The big reveal at the start of a round. Shown over the canvas while the
 * drawer is choosing, so the drawer picks a word *knowing* what they are up
 * against — and everyone else has a few seconds to dread it.
 */
export function DhamakaReveal({ ids, combo }: { ids: DhamakaId[]; combo?: string }) {
  const comboInfo = COMBOS.find((entry) => entry.name === combo);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="animate-dhamaka-in text-2xl font-black uppercase tracking-[0.12em] text-rose-300 drop-shadow-[0_0_24px_rgba(251,113,133,0.6)] sm:text-4xl">
        {countTitle(ids.length)}!
      </p>
      {comboInfo ? (
        <p className="animate-dhamaka-in rounded-full bg-amber-400 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-950 [animation-delay:250ms]">
          {comboInfo.emoji} {comboInfo.name}
        </p>
      ) : null}
      <div className="grid w-full max-w-xl grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:justify-center sm:gap-2">
        {ids.map((id, index) => {
          const dhamaka = dhamakaById(id);
          return (
            <div
              key={id}
              className="animate-dhamaka-in min-w-0 rounded-2xl border border-rose-400/40 bg-slate-950/90 p-1.5 shadow-2xl sm:w-48 sm:p-3"
              style={{ animationDelay: `${300 + index * 220}ms` }}
            >
              <p className="text-2xl sm:text-3xl" aria-hidden="true">{dhamaka.emoji}</p>
              <p className="mt-1 break-words text-[10px] font-black uppercase leading-tight tracking-wide text-white sm:text-sm">{dhamaka.name}</p>
              <p className="mt-1 text-[9px] leading-tight text-slate-400 sm:text-[11px] sm:leading-snug">{dhamaka.rule}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Choosing ────────────────────────────────────────────────────────────────

export function ChoosePanel({
  choices,
  secondsLeft,
  onChoose,
}: {
  choices: Prompt[];
  secondsLeft: number;
  onChoose: (id: string) => void;
}) {
  return (
    <div className="w-full max-w-2xl">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-amber-300 sm:text-sm sm:tracking-[0.2em]">
        Pick what to draw · {secondsLeft}s
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:mt-3 sm:gap-2">
        {choices.map((choice, index) => (
          <button
            key={choice.id}
            type="button"
            onClick={() => onChoose(choice.id)}
            className={`animate-dhamaka-in flex min-h-32 flex-col items-center justify-center gap-1 rounded-2xl border-2 p-2 text-center transition hover:-translate-y-1 hover:shadow-xl active:translate-y-0 sm:min-h-44 sm:p-3 ${DIFFICULTY_STYLE[choice.difficulty]}`}
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <span className="text-[8px] font-black uppercase tracking-[0.14em] opacity-80 sm:text-[10px] sm:tracking-[0.2em]">
              {index === 2 && choice.difficulty !== 'friends' ? 'Chaotic' : DIFFICULTY_LABEL[choice.difficulty]}
            </span>
            <span className="text-2xl sm:text-3xl" aria-hidden="true">{choice.emoji}</span>
            <span className="text-xs font-bold leading-tight text-white sm:text-base">{choice.text}</span>
            <span className="text-[9px] text-slate-400 sm:text-[10px]">{choice.category}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Drawing tools ───────────────────────────────────────────────────────────

export function Toolbar({
  tool,
  color,
  size,
  colors,
  sizes,
  colorLocked,
  canErase,
  onTool,
  onColor,
  onSize,
  onUndo,
  onClear,
}: {
  tool: 'pen' | 'eraser';
  color: string;
  size: number;
  colors: string[];
  sizes: number[];
  /** Color Roulette picks the colour; the drawer does not. */
  colorLocked: boolean;
  canErase: boolean;
  onTool: (tool: 'pen' | 'eraser') => void;
  onColor: (color: string) => void;
  onSize: (size: number) => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-2">
      <div className="flex flex-wrap gap-1">
        {colors.map((swatch) => (
          <button
            key={swatch}
            type="button"
            disabled={colorLocked}
            onClick={() => {
              onColor(swatch);
              onTool('pen');
            }}
            aria-label={`Colour ${swatch}`}
            aria-pressed={tool === 'pen' && color === swatch}
            className={`h-7 w-7 rounded-full border-2 transition disabled:cursor-not-allowed sm:h-8 sm:w-8 ${
              tool === 'pen' && color === swatch
                ? 'scale-110 border-amber-300 shadow-[0_0_0_2px_rgba(15,23,42,1)]'
                : 'border-slate-700 hover:scale-105'
            }`}
            style={{ backgroundColor: swatch }}
          />
        ))}
        {colorLocked ? (
          <span className="self-center pl-1 text-[11px] font-semibold text-rose-300">🎰 changes by itself</span>
        ) : null}
      </div>

      <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
        {sizes.map((width) => (
          <button
            key={width}
            type="button"
            onClick={() => onSize(width)}
            aria-label={`Brush size ${width}`}
            aria-pressed={size === width}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
              size === width ? 'bg-amber-400/20 ring-1 ring-amber-300' : 'hover:bg-slate-800'
            }`}
          >
            <span
              className="rounded-full bg-slate-200"
              style={{ width: Math.min(22, Math.max(3, width / 2.5)), height: Math.min(22, Math.max(3, width / 2.5)) }}
            />
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => onTool(tool === 'eraser' ? 'pen' : 'eraser')}
          disabled={!canErase}
          aria-pressed={tool === 'eraser'}
          title={canErase ? 'Eraser' : 'No erasing this round'}
          className={`rounded-lg p-2 transition disabled:cursor-not-allowed disabled:opacity-30 ${
            tool === 'eraser' ? 'bg-amber-400/20 text-amber-200 ring-1 ring-amber-300' : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Eraser className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canErase}
          title={canErase ? 'Undo' : 'No undo this round'}
          className="rounded-lg p-2 text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!canErase}
          title={canErase ? 'Clear the canvas' : 'No clearing this round'}
          className="rounded-lg p-2 text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** The inks a drawer may pick from, given the round's colour Dhamaka. */
export function inksFor(view: DoodleView): string[] {
  if (view.round.onlyColor) return [view.round.onlyColor];
  if (view.round.roulette) return [];
  return PALETTE;
}

// ── The guess feed ──────────────────────────────────────────────────────────

export function Feed({ entries, you }: { entries: FeedEntry[]; you: string | null }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  // Follow the newest line, unless someone has scrolled up to read.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    if (nearBottom) list.scrollTop = list.scrollHeight;
  }, [entries]);

  return (
    <div ref={listRef} className="doodle-feed-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1 py-2 text-sm" aria-live="polite">
      {entries.length === 0 ? (
        <p className="m-auto text-center text-xs text-slate-500">Guesses show up here.</p>
      ) : null}
      {entries.map((entry) => {
        if (entry.kind === 'system') {
          return (
            <p key={entry.id} className="my-1 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {entry.text}
            </p>
          );
        }
        if (entry.kind === 'correct') {
          return (
            <p
              key={entry.id}
              className={`animate-card-play rounded-lg px-2 py-1 font-bold ${
                entry.playerId === you ? 'bg-emerald-400 text-emerald-950' : 'bg-emerald-500/15 text-emerald-300'
              }`}
            >
              ⚡ {entry.text}
            </p>
          );
        }
        if (entry.kind === 'lock-miss') {
          return (
            <p key={entry.id} className="rounded-lg bg-rose-500/10 px-2 py-1 text-rose-200">
              <span className="font-semibold">{entry.name}</span> <span className="opacity-80">{entry.text}</span>{' '}
              <span className="text-[11px] font-bold">✗ −50</span>
            </p>
          );
        }
        const solvedChat = entry.kind === 'chat' && entry.visibility === 'solved';
        return (
          <p
            key={entry.id}
            className={`break-words rounded-lg px-2 py-0.5 ${
              solvedChat ? 'bg-emerald-500/10 text-emerald-100' : 'text-slate-200'
            } ${typeof entry.visibility === 'object' ? 'opacity-70' : ''}`}
          >
            <span className={`font-semibold ${entry.playerId === you ? 'text-amber-300' : 'text-slate-400'}`}>
              {entry.name}:
            </span>{' '}
            {entry.text}
            {typeof entry.visibility === 'object' ? (
              <span className="ml-1 text-[10px] text-slate-500">(only you)</span>
            ) : null}
          </p>
        );
      })}
    </div>
  );
}

export function GuessBar({
  mode,
  value,
  lock,
  lockAvailable,
  feedback,
  onChange,
  onToggleLock,
  onSubmit,
}: {
  mode: 'guess' | 'chat-solved' | 'chat-all' | 'spent';
  value: string;
  lock: boolean;
  lockAvailable: boolean;
  feedback: { text: string; tone: 'good' | 'bad' | 'hot' | 'warm' | 'cold' } | null;
  onChange: (value: string) => void;
  onToggleLock: () => void;
  onSubmit: () => void;
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const chatMode = mode === 'chat-all' || mode === 'chat-solved';
  const placeholder = {
    guess: lock ? '🔒 Lock in your answer…' : 'Type your guess…',
    'chat-solved': 'Chat with the ones who got it…',
    'chat-all': 'Say something…',
    spent: 'No guesses left this round',
  }[mode];
  const toneStyle = {
    good: 'text-emerald-300',
    bad: 'text-rose-300',
    hot: 'text-orange-300',
    warm: 'text-amber-200',
    cold: 'text-sky-300',
  };

  return (
    <div className="doodle-guess-bar">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className={`flex items-center gap-1 rounded-xl border bg-slate-950 p-1 transition ${
          lock ? 'border-amber-400 shadow-[0_0_18px_-4px_rgba(251,191,36,0.6)]' : 'border-slate-700'
        }`}
      >
        {mode === 'guess' ? (
          <button
            type="button"
            onClick={onToggleLock}
            disabled={!lockAvailable}
            aria-pressed={lock}
            title={lockAvailable ? 'Lock guess: double if right, −50 if wrong' : 'Lock guess used this round'}
            className={`shrink-0 rounded-lg p-2 transition disabled:cursor-not-allowed disabled:opacity-30 ${
              lock ? 'bg-amber-400 text-amber-950' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Lock className="h-4 w-4" />
          </button>
        ) : null}
        {chatMode ? (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setEmojiOpen((open) => !open)}
              aria-label="Add an emoji"
              aria-expanded={emojiOpen}
              className="rounded-lg p-2 text-lg leading-none text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              🙂
            </button>
            {emojiOpen ? (
              <div className="absolute bottom-full left-0 z-30 mb-2 grid w-52 grid-cols-6 gap-1 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl sm:left-auto sm:right-0">
                {DOODLE_CHAT_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onChange(value ? `${value} ${emoji}` : emoji);
                      setEmojiOpen(false);
                    }}
                    aria-label={`Add ${emoji}`}
                    className="rounded-lg p-1.5 text-lg leading-none transition hover:bg-slate-700"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={mode === 'spent'}
          maxLength={60}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed sm:text-sm"
        />
        <button
          type="submit"
          disabled={mode === 'spent' || !value.trim()}
          className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition disabled:opacity-40 ${
            lock ? 'bg-amber-400 text-amber-950' : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
          }`}
        >
          {lock ? 'Lock' : mode === 'guess' ? 'Guess' : 'Send'}
        </button>
      </form>
      {feedback ? (
        <p className={`mt-1 px-1 text-xs font-bold ${toneStyle[feedback.tone]}`}>{feedback.text}</p>
      ) : null}
    </div>
  );
}

// ── Scoreboard ──────────────────────────────────────────────────────────────

export function Scoreboard({
  view,
  seats,
}: {
  view: DoodleView;
  seats: Map<string, SeatInfo>;
}) {
  const rows = [...view.players].sort((a, b) => b.score - a.score);
  const solved = new Set(view.round.solvedBy);
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Scores</h2>
        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold tabular-nums text-amber-300">
          Round {Math.min(view.round.number, view.totalRounds)}/{view.totalRounds}
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        {rows.map((player, place) => (
          <ScoreRow
            key={player.id}
            player={player}
            place={place}
            seat={seats.get(player.id)}
            drawing={player.id === view.round.drawerId && view.phase !== 'GAME_OVER'}
            solved={solved.has(player.id)}
            you={player.id === view.you}
          />
        ))}
      </div>
    </section>
  );
}

function ScoreRow({
  player,
  place,
  seat,
  drawing,
  solved,
  you,
}: {
  player: DoodlePlayer;
  place: number;
  seat?: SeatInfo;
  drawing: boolean;
  solved: boolean;
  you: boolean;
}) {
  // Count the score up rather than snapping to it, so points are *seen* landing.
  const [shown, setShown] = useState(player.score);
  useEffect(() => {
    if (shown === player.score) return;
    const step = Math.max(1, Math.ceil(Math.abs(player.score - shown) / 12));
    const timer = setTimeout(
      () => setShown((value) => (value < player.score ? Math.min(player.score, value + step) : Math.max(player.score, value - step))),
      30,
    );
    return () => clearTimeout(timer);
  }, [player.score, shown]);

  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition ${
        solved ? 'bg-emerald-500/15' : drawing ? 'bg-amber-400/10' : you ? 'bg-slate-800/60' : ''
      }`}
    >
      <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-slate-500">
        {place === 0 && player.score > 0 ? '👑' : place + 1}
      </span>
      <span className="relative shrink-0">
        <Avatar avatar={seat?.avatar ?? null} userKey={player.id} name={player.name} className="h-7 w-7" />
        {seat && !seat.isOnline ? (
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-slate-600 ring-2 ring-slate-900" title="Offline" />
        ) : null}
      </span>
      <span className={`min-w-0 flex-1 truncate text-sm ${you ? 'font-bold text-white' : 'text-slate-200'}`}>
        {player.name}
        {player.streak >= 2 ? <span className="ml-1 text-[11px] text-orange-300">🔥{player.streak}</span> : null}
      </span>
      {drawing ? <span className="text-base" title="Drawing">🎨</span> : null}
      {solved ? <span className="text-sm font-bold text-emerald-300" title="Guessed it">✓</span> : null}
      <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums text-white">{shown}</span>
    </div>
  );
}

// ── End of a round ──────────────────────────────────────────────────────────

export function RoundResultCard({
  result,
  names,
  nextDrawer,
  nextCount,
  secondsLeft,
}: {
  result: RoundResult;
  names: Map<string, string>;
  nextDrawer: string | null;
  nextCount: number | null;
  secondsLeft: number;
}) {
  const earners = Object.entries(result.points).sort((a, b) => b[1].total - a[1].total);
  const visibleEarners = earners.slice(0, 3);
  const nameOf = (id: string) => names.get(id) ?? 'Someone';
  const outcome =
    result.outcome === 'perfect' ? '🔥 Perfect draw' : result.outcome === 'disaster' ? '💀 Nobody got it' : 'Round complete';
  return (
    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-300/25 bg-slate-900/95 p-2.5 text-center shadow-2xl sm:p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Round over</p>
        <p className={`truncate text-[10px] font-black uppercase tracking-wide ${result.outcome === 'perfect' ? 'text-emerald-300' : result.outcome === 'disaster' ? 'text-slate-300' : 'text-slate-400'}`}>
          {outcome}
        </p>
      </div>

      <div className="mt-1.5 rounded-xl bg-slate-950/80 px-2.5 py-1.5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">The answer</p>
        <p className="mt-0.5 truncate text-lg font-black text-white sm:text-xl">
          {result.prompt.emoji} {result.prompt.text}
        </p>
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
        Drawn by <span className="font-semibold text-slate-200">{nameOf(result.drawerId)}</span> · {result.guessed}/
        <span className="font-semibold text-emerald-300">{result.eligible}</span> guessed it
        {result.fastest ? (
          <>
            {' '}· fastest <span className="font-semibold text-amber-300">{nameOf(result.fastest.playerId)}</span>{' '}
            {result.fastest.seconds}s
          </>
        ) : null}
      </p>

      {result.awards.length ? (
        <div className="mt-1.5 flex flex-wrap justify-center gap-1">
          {result.awards.slice(0, 2).map((award) => (
            <span key={`${award.title}-${award.playerId}`} className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-100">
              {award.emoji} <span className="font-bold">{award.title}</span> · {nameOf(award.playerId)}
            </span>
          ))}
        </div>
      ) : null}

      {visibleEarners.length ? (
        <div className="mt-1.5 rounded-xl bg-slate-950/70 px-2 py-1.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Points this round</p>
          <div className="mt-1 flex flex-wrap justify-center gap-1">
            {visibleEarners.map(([id, points]) => (
              <span key={id} className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-200">
                {nameOf(id)} <span className="font-black text-emerald-300">+{points.total}</span>
              </span>
            ))}
            {earners.length > visibleEarners.length ? <span className="self-center text-[9px] text-slate-500">+ more on scoreboard</span> : null}
          </div>
        </div>
      ) : null}

      {nextDrawer || (nextCount && nextCount >= 2) ? (
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10px]">
          {nextDrawer ? (
            <span className="text-slate-300">
              Next: <span className="font-bold text-amber-300">{nextDrawer}</span> in {secondsLeft}s
            </span>
          ) : null}
          {nextCount && nextCount >= 2 ? (
            <span className="animate-urgent rounded-full bg-rose-500 px-2 py-0.5 font-black uppercase tracking-wider text-rose-950">
              {countTitle(nextCount)} next
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AwardChip({ award, name }: { award: Award; name: string }) {
  return (
    <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-100">
      {award.emoji} <span className="font-bold">{award.title}</span> — {name}
      {award.detail ? <span className="text-amber-200/60"> ({award.detail})</span> : null}
    </span>
  );
}

// ── End of the game ─────────────────────────────────────────────────────────

export function FinalResults({
  view,
  seats,
  isAdmin,
  adminName,
  onReset,
}: {
  view: DoodleView;
  seats: Map<string, SeatInfo>;
  isAdmin: boolean;
  adminName: string;
  onReset: () => void;
}) {
  const final = view.final!;
  const names = new Map(view.players.map((player) => [player.id, player.name]));
  const [first, second, third] = final.standings;
  const medal = ['🥇', '🥈', '🥉'];
  const podium = [second, first, third];

  return (
    <section className="rounded-2xl border border-amber-300/40 bg-gradient-to-b from-amber-500/15 via-slate-900/90 to-slate-900/90 p-4 text-center sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Final results</p>
      {first ? (
        <p className="animate-dhamaka-in mt-2 text-3xl font-black text-white sm:text-5xl">🏆 {first.name} wins!</p>
      ) : null}

      <div className="mx-auto mt-6 flex max-w-md items-end justify-center gap-2 sm:gap-4">
        {podium.map((standing, index) => {
          if (!standing) return <div key={index} className="flex-1" />;
          const place = final.standings.indexOf(standing);
          const height = ['h-20', 'h-28', 'h-14'][index];
          return (
            <div key={standing.playerId} className="flex flex-1 flex-col items-center gap-1">
              <span className={place === 0 ? 'animate-podium-crown text-2xl' : 'text-xl'}>{medal[place]}</span>
              <Avatar
                avatar={seats.get(standing.playerId)?.avatar ?? null}
                userKey={standing.playerId}
                name={standing.name}
                className={place === 0 ? 'h-14 w-14' : 'h-11 w-11'}
              />
              <span className="max-w-full truncate text-sm font-bold text-white">{standing.name}</span>
              <span className="text-xs font-bold tabular-nums text-amber-300">{standing.score}</span>
              <div
                className={`w-full rounded-t-xl ${height} ${
                  place === 0 ? 'bg-amber-400/40' : place === 1 ? 'bg-slate-400/30' : 'bg-orange-700/30'
                }`}
              />
            </div>
          );
        })}
      </div>

      {final.standings.length > 3 ? (
        <div className="mx-auto mt-3 max-w-md space-y-1 text-left">
          {final.standings.slice(3).map((standing, index) => (
            <div key={standing.playerId} className="flex justify-between rounded-lg bg-slate-950/60 px-3 py-1.5 text-sm">
              <span className="text-slate-300">
                {index + 4}. {standing.name}
              </span>
              <span className="font-bold tabular-nums text-white">{standing.score}</span>
            </div>
          ))}
        </div>
      ) : null}

      {final.awards.length ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {final.awards.map((award) => (
            <AwardChip key={award.title} award={award} name={names.get(award.playerId) ?? 'Someone'} />
          ))}
        </div>
      ) : null}

      <div className="mt-6">
        {isAdmin ? (
          <button
            type="button"
            onClick={onReset}
            className="rounded-xl bg-amber-500 px-6 py-3 text-base font-black text-amber-950 transition hover:bg-amber-400"
          >
            One more game
          </button>
        ) : (
          <p className="text-sm text-slate-400">
            Waiting for <span className="font-semibold text-slate-200">{adminName}</span> to start another
          </p>
        )}
      </div>
    </section>
  );
}
