'use client';

import { useEffect, useState } from 'react';
import { BID_STEP, MAX_BID, PARTNER_CALLS, buildDeck, minimumBid } from './engine';
import type { TigdiPlayerCount } from './engine';
import { SUIT_GLYPH } from './Table';
import type { Suit, TigdiView } from './types';

/**
 * The two decisions that happen before a card is played: what to bid, and —
 * having won the bidding — what trump is and who you are dragging onto your
 * side.
 *
 * It sits where the hand sits, in the column beside the table, because both
 * decisions are made by looking at the cards you were dealt. Only one of them
 * is ever on screen at a time.
 */

const SUITS: Suit[] = ['SPADES', 'HEARTS', 'CLUBS', 'DIAMONDS'];
/** Card codes carry the suit as its first letter; this reads one back. */
const SUIT_BY_LETTER: Record<string, Suit> = {
  S: 'SPADES',
  H: 'HEARTS',
  C: 'CLUBS',
  D: 'DIAMONDS',
};
const isRed = (suit: Suit) => suit === 'HEARTS' || suit === 'DIAMONDS';

export function BiddingPanel({
  view,
  onBid,
  onContract,
}: {
  view: TigdiView;
  onBid: (amount: number | null) => void;
  onContract: (trumpSuit: Suit, calledCards: string[]) => void;
}) {
  const mine = view.you !== null && view.currentTurn === view.you;
  const floor = minimumBid(view);
  const waitingOn = view.players[view.currentTurn]?.name ?? 'the next player';

  if (view.phase === 'BIDDING') {
    return (
      <div className="rounded-lg bg-slate-950/60 p-3 sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium text-white">Bidding</p>
          <p className="text-xs text-slate-400">
            {view.highBid ? `${view.players[view.highBidder!]?.name} holds it at ${view.highBid}` : 'Nobody has opened'}
          </p>
        </div>

        {mine ? (
          <>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[0, 1, 2, 3]
                .map((step) => floor + step * BID_STEP)
                .filter((amount) => amount <= MAX_BID)
                .map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => onBid(amount)}
                    className="rounded-lg border border-rose-400/50 py-2.5 text-base font-semibold tabular-nums text-rose-200 transition hover:bg-rose-400/10 active:translate-y-0.5"
                  >
                    {amount}
                  </button>
                ))}
            </div>
            <button
              type="button"
              onClick={() => onBid(null)}
              className="mt-2 w-full rounded-lg border border-slate-700 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 active:translate-y-0.5"
            >
              Pass — and you are out of this auction
            </button>
          </>
        ) : (
          <p className="mt-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-center text-sm text-slate-400">
            Waiting on <span className="font-semibold text-slate-200">{waitingOn}</span>…
          </p>
        )}

        {view.bidLog.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
            {view.bidLog.map((entry, index) => (
              <span
                key={index}
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  entry.amount === null
                    ? 'bg-slate-800 text-slate-500 line-through'
                    : 'bg-rose-500/15 text-rose-200'
                }`}
              >
                {view.players[entry.seat]?.name} {entry.amount ?? 'out'}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (view.phase !== 'CALLING') return null;

  return view.you === view.highBidder ? (
    <ContractPicker view={view} onContract={onContract} />
  ) : (
    <div className="rounded-lg bg-slate-950/60 p-3 sm:p-4">
      <p className="font-medium text-white">
        {view.players[view.highBidder!]?.name} bought the hand for {view.highBid}
      </p>
      <p className="mt-1 text-sm text-slate-400">
        They are picking trump and calling{' '}
        {PARTNER_CALLS[view.playerCount as TigdiPlayerCount] === 1 ? 'a card' : 'two cards'}. If one
        of them is in your hand, you are about to be on their side — and nobody else will know.
      </p>
    </div>
  );
}

/**
 * The bidder's turn on their own: trump, then the cards that name their
 * partners.
 *
 * Built one card at a time — a rank, then a suit — rather than as a grid of
 * every card in the deck. The grid showed fifty-odd buttons at once to make a
 * choice that is really two small ones, and on a phone it was a wall. This way
 * each row is short enough to read, and the two rows teach each other: pick a
 * suit and the ranks you are holding grey out, pick a rank and the suits you
 * hold it in do the same. You cannot build a card you are holding, which is the
 * classic way to end up a partner short.
 */
function ContractPicker({
  view,
  onContract,
}: {
  view: TigdiView;
  onContract: (trumpSuit: Suit, calledCards: string[]) => void;
}) {
  const required = PARTNER_CALLS[view.playerCount as TigdiPlayerCount];
  const [trump, setTrump] = useState<Suit | null>(null);
  const [called, setCalled] = useState<string[]>([]);
  const [rank, setRank] = useState<string | null>(null);
  const [suit, setSuit] = useState<Suit | null>(null);

  const hand = view.you === null ? [] : (view.players[view.you]?.cards ?? []);
  const held = new Set(hand.map((card) => card.code));
  const deck = buildDeck(view.playerCount as TigdiPlayerCount);
  const inDeck = new Set(deck.map((card) => card.code));
  // Only the ranks this table size actually deals: the smallest cards are
  // trimmed out to make the deck divide evenly.
  const ranks = [...new Set(deck.map((card) => card.rank))];

  // A new deal must not arrive with the last hand's picks still selected.
  useEffect(() => {
    setCalled([]);
    setRank(null);
    setSuit(null);
  }, [view.trickNumber]);

  /** Why this card cannot be called, or undefined if it can. */
  const refusal = (code: string) =>
    !inDeck.has(code)
      ? 'not in this deck'
      : held.has(code)
        ? 'in your own hand'
        : called.includes(code)
          ? 'already called'
          : undefined;

  const pending = rank && suit ? `${rank}${suit[0]}` : null;
  const pendingRefusal = pending ? refusal(pending) : undefined;
  const full = called.length >= required;

  function addPending() {
    if (!pending || pendingRefusal || full) return;
    setCalled((current) => [...current, pending]);
    setRank(null);
    setSuit(null);
  }

  /** Greyed out because of the other half of the choice already made. */
  const rankBlocked = (candidate: string) =>
    suit ? refusal(`${candidate}${suit[0]}`) !== undefined : false;
  const suitBlocked = (candidate: Suit) =>
    rank ? refusal(`${rank}${candidate[0]}`) !== undefined : false;

  const ready = trump !== null && called.length === required;

  return (
    <div className="rounded-lg border border-rose-400/40 bg-slate-950/60 p-3 sm:p-4">
      <p className="font-medium text-white">You bought the hand for {view.highBid}</p>
      <p className="mt-1 text-sm text-slate-400">
        Name trump, then call {required === 1 ? 'a card' : `${required} cards`} you are not
        holding. Whoever has {required === 1 ? 'it' : 'them'} is with you.
      </p>

      <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-slate-500">1 · Trump</p>
      <div className="mt-1.5 grid grid-cols-4 gap-2">
        {SUITS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTrump(option)}
            aria-pressed={trump === option}
            aria-label={option.toLowerCase()}
            className={`rounded-lg border py-2 text-2xl leading-none transition active:translate-y-0.5 ${
              trump === option
                ? 'border-rose-400 bg-rose-500/20'
                : 'border-slate-700 hover:border-slate-500'
            } ${isRed(option) ? 'text-rose-300' : 'text-slate-200'}`}
          >
            {SUIT_GLYPH[option]}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
          2 · Call {required === 1 ? 'a partner' : `${required} partners`}
        </p>
        <p className="text-[11px] text-slate-500">
          {called.length} of {required} called
        </p>
      </div>

      {/* What has been called so far, and a way to take one back. */}
      {called.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {called.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setCalled((current) => current.filter((entry) => entry !== code))}
              title={`Take back the ${code}`}
              className="rounded-full bg-rose-500 px-2.5 py-1 text-xs font-bold text-rose-950 transition hover:bg-rose-400"
            >
              {code.slice(0, -1)}
              {SUIT_GLYPH[SUIT_BY_LETTER[code.slice(-1)]]} ×
            </button>
          ))}
        </div>
      ) : null}

      {full ? null : (
        <>
          <div className="mt-2 flex flex-wrap gap-1">
            {ranks.map((option) => {
              const blocked = rankBlocked(option);
              return (
                <button
                  key={option}
                  type="button"
                  disabled={blocked}
                  onClick={() => setRank(option === rank ? null : option)}
                  aria-pressed={rank === option}
                  className={`min-w-[2rem] flex-1 rounded px-1 py-2 text-sm font-semibold transition ${
                    rank === option
                      ? 'bg-rose-500 text-rose-950'
                      : blocked
                        ? 'cursor-not-allowed bg-slate-900 text-slate-700 line-through'
                        : 'bg-slate-800/70 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {SUITS.map((option) => {
              const blocked = suitBlocked(option);
              return (
                <button
                  key={option}
                  type="button"
                  disabled={blocked}
                  onClick={() => setSuit(option === suit ? null : option)}
                  aria-pressed={suit === option}
                  aria-label={option.toLowerCase()}
                  className={`rounded py-1.5 text-xl leading-none transition ${
                    suit === option
                      ? 'bg-rose-500 text-rose-950'
                      : blocked
                        ? 'cursor-not-allowed bg-slate-900 text-slate-700'
                        : `bg-slate-800/70 hover:bg-slate-700 ${
                            isRed(option) ? 'text-rose-300' : 'text-slate-200'
                          }`
                  }`}
                >
                  {SUIT_GLYPH[option]}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addPending}
            disabled={!pending || pendingRefusal !== undefined}
            className="mt-2 w-full rounded-lg border border-rose-400/50 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
          >
            {!rank && !suit
              ? 'Pick a rank and a suit'
              : !rank
                ? 'Now pick a rank'
                : !suit
                  ? 'Now pick a suit'
                  : pendingRefusal
                    ? `The ${rank}${SUIT_GLYPH[suit]} is ${pendingRefusal}`
                    : `Call the ${rank}${SUIT_GLYPH[suit]}`}
          </button>
        </>
      )}

      <button
        type="button"
        disabled={!ready}
        onClick={() => onContract(trump!, called)}
        className="mt-3 w-full rounded-lg bg-rose-500 px-4 py-2.5 text-sm font-semibold text-rose-950 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {trump === null
          ? 'Pick trump first'
          : called.length < required
            ? `Call ${required - called.length} more`
            : `Play it — ${SUIT_GLYPH[trump]} trump, calling ${called.join(' and ')}`}
      </button>
    </div>
  );
}
