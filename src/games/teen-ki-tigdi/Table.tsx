'use client';

import type { CSSProperties, RefObject } from 'react';
import { Avatar } from '@/components/Avatar';
import { CardBack, PlayingCard } from '@/components/PlayingCard';
import type { Card, Suit, TigdiPlay, TigdiView } from './types';

/**
 * The felt: a table with exactly as many edges as there are players, and one
 * player sitting at the middle of each.
 *
 * Mendi Coat's table is a three-by-three grid, which works because it is always
 * four people in four corners. Five, six and seven do not divide into that
 * grid — laid out that way the seats bunch up along the top and leave the sides
 * empty. So the table is drawn as a polygon instead and the seats are placed by
 * angle, which spaces them evenly whatever the table size and gives everyone
 * their own edge to sit at.
 *
 * You are always at the bottom edge, and the rest run clockwise from your left,
 * which is the order they play in.
 */

export const SUIT_GLYPH: Record<Suit, string> = {
  SPADES: '♠',
  HEARTS: '♥',
  CLUBS: '♣',
  DIAMONDS: '♦',
};

export interface TigdiSeatPlayer {
  id: string;
  name: string;
  avatar: string | null;
  title: string | null;
  isBot: boolean;
  isOnline: boolean;
  seat: number;
}

/** Straight down, in screen coordinates, is where you sit. */
const BOTTOM = 90;

/** Where a seat sits, as a percentage of the table box. */
function pointAt(degrees: number, radiusX: number, radiusY: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    left: 50 + radiusX * Math.cos(radians),
    top: 50 + radiusY * Math.sin(radians),
  };
}

/**
 * The table's outline: a polygon with one edge per player, turned so that an
 * edge — not a corner — faces each seat. The corners fall halfway between two
 * seats, which is what puts every player at the middle of their own side.
 */
function tableOutline(count: number) {
  const half = 180 / count;
  return Array.from({ length: count }, (_, index) => {
    const { left, top } = pointAt(BOTTOM + half + index * (360 / count), 50, 50);
    return `${left.toFixed(2)}% ${top.toFixed(2)}%`;
  }).join(', ');
}

/**
 * Roughly where a card flies in from when the hand is dealt: from the middle of
 * the table outward to its seat. A flourish, so an approximate direction reads
 * fine — unlike the sweep, which has to land on a real card.
 */
function dealVector(degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return { x: -Math.round(70 * Math.cos(radians)), y: -Math.round(70 * Math.sin(radians)) };
}

export function TigdiTable({
  view,
  players,
  emotes,
  tablePlays,
  collectedBy,
  sweepOffsets,
  cardRefs,
  isDealing,
  moveError,
  trumpReveal,
  revealed,
}: {
  view: TigdiView;
  players: Array<TigdiSeatPlayer | null>;
  emotes: Record<number, { emoji: string; at: number }>;
  tablePlays: TigdiPlay[];
  collectedBy: number | null;
  sweepOffsets: Record<number, { x: number; y: number; rotation: number }> | null;
  cardRefs: RefObject<Array<HTMLDivElement | null>>;
  isDealing: boolean;
  moveError: string | null;
  trumpReveal: Suit | null;
  /** A partner just outed by their own called card, flashed over the table. */
  revealed: { name: string; card: string } | null;
}) {
  const count = view.playerCount;
  const you = view.you ?? 0;
  const outline = tableOutline(count);

  return (
    <div className="relative mx-auto aspect-square w-full sm:max-w-[38rem]">
      {/* The rim, and the felt cut to the same shape just inside it. */}
      <div
        className="absolute inset-0 bg-amber-950/80"
        style={{ clipPath: `polygon(${outline})` }}
        aria-hidden="true"
      />
      <div
        className="polygon-table absolute inset-[6px] bg-emerald-800 sm:inset-[10px]"
        style={{ clipPath: `polygon(${outline})` }}
        aria-hidden="true"
      />
      {/* A gold hairline just inside the felt, the way the four-player table has
          one — drawn as a third polygon rather than a border, which a clipped
          box cannot show. */}
      <div
        className="absolute inset-[10px] bg-amber-200/25 sm:inset-[16px]"
        style={{ clipPath: `polygon(${outline})` }}
        aria-hidden="true"
      />
      <div
        className="polygon-table absolute inset-[11px] bg-emerald-800 sm:inset-[17px]"
        style={{ clipPath: `polygon(${outline})` }}
        aria-hidden="true"
      />

      {moveError ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
          <p
            role="alert"
            className="animate-card-play max-w-[80%] rounded-xl border border-rose-400/60 bg-rose-950/90 px-4 py-3 text-center text-sm font-semibold text-rose-100 shadow-xl backdrop-blur-sm"
          >
            {moveError}
          </p>
        </div>
      ) : null}

      {trumpReveal ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-1 bg-emerald-950/55 backdrop-blur-sm">
          <p className="animate-trump-reveal text-6xl leading-none text-amber-200 drop-shadow-[0_0_28px_rgba(255,217,112,0.8)] sm:text-8xl">
            {SUIT_GLYPH[trumpReveal]}
          </p>
          <p className="animate-card-play text-xs font-black uppercase tracking-[0.3em] text-amber-300 sm:text-sm">
            {trumpReveal} is trump
          </p>
        </div>
      ) : null}

      {/* The game's own moment: a called card lands and somebody is no longer
          anonymous. Mendi Coat flashes a coat here; this flashes a partner. */}
      {revealed ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-emerald-950/60 px-4 text-center backdrop-blur-sm">
          <p className="animate-card-play text-3xl font-black uppercase tracking-[0.12em] text-rose-300 drop-shadow-[0_0_25px_rgba(251,113,133,0.7)] sm:text-5xl">
            {revealed.name}
          </p>
          <p className="text-sm font-semibold text-amber-100 sm:text-base">
            played {revealed.card} — they are with the bidder
          </p>
        </div>
      ) : null}

      {/* What the table is waiting for, in the middle where the pile would be. */}
      <div className="absolute left-1/2 top-1/2 z-10 w-[30%] -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-full border border-amber-300/30 bg-emerald-950/70 px-2 py-1.5 text-center text-[10px] leading-tight text-amber-100 sm:px-3 sm:py-2 sm:text-xs">
          {view.phase === 'BIDDING' ? (
            <>
              <span className="block font-semibold">
                {view.highBid ? `Bid at ${view.highBid}` : 'Bidding open'}
              </span>
              <span className="block truncate text-amber-100/60">
                {view.players[view.currentTurn]?.name}&rsquo;s call
              </span>
            </>
          ) : view.phase === 'CALLING' ? (
            <>
              <span className="block truncate font-semibold">
                {view.players[view.highBidder!]?.name} won it
              </span>
              <span className="block text-amber-100/60">naming trump…</span>
            </>
          ) : view.phase === 'PASSED_OUT' ? (
            <span className="font-semibold">Nobody bid — dealing again</span>
          ) : (
            <>
              {/* The bid, not the running score. A team total moving mid-hand
                  would name whoever just won the trick. */}
              <span className="block font-semibold tabular-nums">Bid {view.highBid}</span>
              <span className="block truncate text-amber-100/60">
                {collectedBy !== null
                  ? `${view.players[collectedBy]?.name} took it`
                  : `Trick ${view.trickNumber}`}
              </span>
            </>
          )}
        </div>
      </div>

      {view.players.map((player) => {
        const seat = player.seat;
        // How far round the table this seat is from you, which is what decides
        // where it is drawn — your own seat is always the bottom edge.
        const relative = (seat - you + count) % count;
        const angle = BOTTOM + relative * (360 / count);
        const chip = pointAt(angle, 40, 42);
        // Far enough in to read as played, far enough out to clear both the
        // status chip in the middle and each other — the side seats of a
        // seven-player table are the tight case.
        const slot = pointAt(angle, 27, 27);
        const deal = dealVector(angle);
        const occupant = players[seat] ?? null;
        const play = tablePlays.find((entry) => entry.seat === seat);
        const isTurn =
          view.currentTurn === seat && view.phase !== 'FINISHED' && view.phase !== 'PASSED_OUT';

        /**
         * What this seat is, as far as this viewer knows. The server sends null
         * for a team that has not given itself away, so an unknown seat is
         * genuinely unknown here — there is nothing to hide at this level.
         */
        const marker =
          view.phase === 'BIDDING' ? (
            player.passed ? (
              <span className="rounded-full bg-emerald-950/70 px-1.5 text-[8px] font-bold uppercase tracking-wider text-emerald-100/40">
                out
              </span>
            ) : player.bid ? (
              <span className="rounded-full bg-amber-400/90 px-1.5 text-[9px] font-bold tabular-nums text-emerald-950">
                {player.bid}
              </span>
            ) : null
          ) : player.team === 'BIDDER' ? (
            <span className="rounded-full bg-rose-400 px-1.5 text-[8px] font-bold uppercase tracking-wider text-rose-950">
              {seat === view.highBidder ? 'bid' : 'with'}
            </span>
          ) : player.team === 'OPPONENT' ? (
            <span className="rounded-full bg-slate-200/90 px-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-900">
              vs
            </span>
          ) : view.phase === 'PLAYING' ? (
            <span className="rounded-full bg-emerald-950/70 px-1.5 text-[9px] font-bold text-amber-200/70">
              ?
            </span>
          ) : null;

        return (
          <div key={seat}>
            {/* The card slot sits between its seat and the middle. It is always
                rendered, card or no card, so nothing shifts between tricks. */}
            <div
              className="absolute z-10 h-[4.25rem] w-12 -translate-x-1/2 -translate-y-1/2 sm:h-[6rem] sm:w-[4.25rem]"
              style={{ left: `${slot.left}%`, top: `${slot.top}%` } as CSSProperties}
            >
              {isDealing && !play ? (
                <div
                  className="animate-deal-out h-full w-full"
                  style={
                    {
                      '--deal-x': `${deal.x}px`,
                      '--deal-y': `${deal.y}px`,
                      animationDelay: `${relative * 80}ms`,
                    } as CSSProperties
                  }
                >
                  <CardBack className="h-full w-full drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]" />
                </div>
              ) : null}
              {play ? (
                <div
                  // Keyed by card, which is unique within a hand, so the cards
                  // already down are not remounted when the last one lands.
                  key={play.card.code}
                  ref={(element) => {
                    cardRefs.current[seat] = element;
                  }}
                  className={`h-full w-full ${
                    collectedBy === null
                      ? 'animate-card-play'
                      : // Wait for the measurement, so the sweep always has a
                        // real destination to travel to.
                        sweepOffsets
                        ? 'animate-trick-sweep'
                        : ''
                  }`}
                  style={
                    collectedBy === null || !sweepOffsets?.[seat]
                      ? undefined
                      : ({
                          '--sweep-x': `${sweepOffsets[seat].x}px`,
                          '--sweep-y': `${sweepOffsets[seat].y}px`,
                          '--sweep-r': `${sweepOffsets[seat].rotation}deg`,
                        } as CSSProperties)
                  }
                >
                  <PlayingCard
                    card={play.card}
                    detail="compact"
                    className="h-full w-full drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]"
                  />
                </div>
              ) : null}
            </div>

            {/* The player, on their own edge. */}
            <div
              className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
              style={{ left: `${chip.left}%`, top: `${chip.top}%` } as CSSProperties}
            >
              {emotes[seat] ? (
                <span
                  key={emotes[seat].at}
                  className="animate-emote-pop pointer-events-none absolute -top-7 left-1/2 z-30 -translate-x-1/2 text-3xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
                  aria-hidden="true"
                >
                  {emotes[seat].emoji}
                </span>
              ) : null}
              <div className="flex items-center gap-1">
                <div
                  className={`flex max-w-[4.5rem] items-center gap-1 rounded-full px-1.5 py-1 text-[9px] font-semibold sm:max-w-[7rem] sm:px-2 sm:text-[10px] ${
                    isTurn ? 'bg-amber-300 text-emerald-950' : 'bg-emerald-950/80 text-emerald-100'
                  }`}
                  title={`${player.name} · Seat ${seat + 1}`}
                >
                  {occupant && !occupant.isBot ? (
                    <Avatar
                      avatar={occupant.avatar}
                      userKey={occupant.id}
                      name={player.name}
                      className="h-4 w-4 shrink-0 sm:h-5 sm:w-5"
                    />
                  ) : null}
                  <span className="min-w-0 truncate">{player.name}</span>
                </div>
                {marker}
              </div>
              <span className="rounded-full bg-emerald-950/60 px-1.5 text-[9px] tabular-nums text-emerald-100/50">
                {player.cardsLeft}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
