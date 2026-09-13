'use client';

import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import { ChevronDown, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { LoadingScreen } from '@/components/LoadingScreen';
import { PlayingCard } from '@/components/PlayingCard';
import { EMOTES, isEmote } from '@/lib/emotes';
import { useVoiceChat } from '@/components/useVoiceChat';
import { closeCues, playCue } from '@/lib/table-cues';
import { BiddingPanel } from './BiddingPanel';
import { SUIT_GLYPH, TigdiTable, type TigdiSeatPlayer } from './Table';
import { TOTAL_POINTS, cardPoints } from './engine';
import type { Card, Suit, TigdiPlay, TigdiView } from './types';

/**
 * A Teen Ki Tigdi table.
 *
 * Built on the same bones as the Mendi Coat room — the same sidebar-and-board
 * layout, the same felt, the same deal, play and sweep animations — because a
 * player moving between the two games should not have to learn a second room.
 * What differs is only what the games differ on: an auction before the cards,
 * a contract instead of a cut, and sides that are not known when play starts.
 *
 * The one thing to know before reading it: this component is never given the
 * whole game. The server sends each socket a view built for its own seat, with
 * every other hand and every unrevealed partner already stripped out. So there
 * is nothing here that filters secrets for display — what arrives is what this
 * player is allowed to know, and the code can render all of it.
 */

interface TigdiRoomClientProps {
  roomCode: string;
  playerId: string;
  playerName: string;
  playerAvatar: string | null;
  playerTitle: string | null;
}

interface TigdiHandRecord {
  bid: number;
  bidderSeat: number;
  trumpSuit: Suit;
  calledCards: string[];
  points: Record<'BIDDER' | 'OPPONENT', number>;
  made: boolean;
  names: string[];
  teams: Array<'BIDDER' | 'OPPONENT'>;
}

/** The lobby half of what the server reports, alongside the hand itself. */
interface TigdiRoomPayload {
  seatCount: number;
  calls: number;
  minBid: number;
  scores: number[];
  history: TigdiHandRecord[];
  admin: { id: string; name: string; isHost: boolean } | null;
  players: Array<TigdiSeatPlayer | null>;
}

const EMPTY_ROOM: TigdiRoomPayload = {
  seatCount: 7,
  calls: 2,
  minBid: 130,
  scores: [],
  history: [],
  admin: null,
  players: [],
};

/** Matches the Mendi Coat table: hold the finished trick, then sweep it. */
const TRICK_HOLD_MS = 900;
const TRICK_SWEEP_MS = 780;
/** How long the finished hand sits before the page scrolls to the result. */
const END_OF_HAND_PAUSE_MS = 2200;

const cardLabel = (card: Card) => `${card.rank} of ${card.suit.toLowerCase()}`;

export function TigdiRoomClient({
  roomCode,
  playerId,
  playerName,
  playerAvatar,
  playerTitle,
}: TigdiRoomClientProps) {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState<TigdiRoomPayload>(EMPTY_ROOM);
  const [view, setView] = useState<TigdiView | null>(null);
  const [seat, setSeat] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [enteringGame, setEnteringGame] = useState(false);
  const [isDealing, setIsDealing] = useState(false);
  const [trumpReveal, setTrumpReveal] = useState<Suit | null>(null);
  const [revealed, setRevealed] = useState<{ name: string; card: string } | null>(null);
  const [emotes, setEmotes] = useState<Record<number, { emoji: string; at: number }>>({});
  const [visibleThought, setVisibleThought] = useState<{ name: string; message: string } | null>(
    null,
  );
  const [thoughtInput, setThoughtInput] = useState('');
  const [seatsOpen, setSeatsOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  // The finished trick currently being shown: face up first so everyone can
  // read the card that won it, then swept to the winner.
  const [presentedTrick, setPresentedTrick] = useState<{
    trickNumber: number;
    cards: TigdiPlay[];
    winner: number;
    phase: 'hold' | 'sweep';
  } | null>(null);
  // How far each seat's card must travel to land on the winner's, measured from
  // the live layout — the grid columns are not equal widths, so this cannot be
  // worked out from seat numbers alone.
  const [sweepOffsets, setSweepOffsets] = useState<Record<
    number,
    { x: number; y: number; rotation: number }
  > | null>(null);

  // Previous values, so a fresh trick or a fresh deal can be told from a state
  // we have only just joined into — reconnecting mid-hand replays neither.
  const seenStateRef = useRef(false);
  const trickNumberRef = useRef(0);
  const phaseRef = useRef<string | null>(null);
  const revealedRef = useRef<Record<string, number>>({});
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const boardRef = useRef<HTMLElement | null>(null);
  const outcomeRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<Array<ReturnType<typeof setTimeout> | null>>([]);

  /**
   * A timeout the room owns, so leaving the table cancels everything still
   * pending — a sweep, a reveal, a scroll. Each one forgets itself as it fires,
   * or the list would grow for as long as the tab stays open.
   */
  // Talking to the table, over the same connection the cards use. The relay
  // lives with the socket server rather than with either game, so this is the
  // same voice channel the Mendi Coat room uses.
  const voice = useVoiceChat(socket, roomCode);

  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current = timers.current.filter((entry) => entry !== id);
      fn();
    }, ms);
    timers.current.push(id);
    return id;
  };

  useEffect(() => {
    const client = io({ path: '/socket.io' });
    setSocket(client);
    setIsConnected(client.connected);
    client.on('connect', () => setIsConnected(true));
    client.on('disconnect', () => setIsConnected(false));

    // Watch first, then sit down: the room paints even if every seat is taken,
    // so a latecomer sees the table rather than an error on a blank page.
    client.emit('tigdi:watch', { roomCode });
    client.emit('tigdi:join', { roomCode, playerId, playerName, playerAvatar, playerTitle });

    client.on('tigdi:room', (payload: TigdiRoomPayload) => setRoom(payload));
    client.on('tigdi:state', (payload: TigdiView | null) => setView(payload));
    client.on('tigdi:seat', (payload: number) => setSeat(payload));
    client.on('tigdi:error', (message: string) => setError(message));
    client.on('tigdi:closed', () => {
      setView(null);
      setSeat(null);
      setError('The host closed this room.');
      router.replace('/games/teen-ki-tigdi');
    });
    client.on('tigdi:said', (payload: { seat: number; name: string; message: string }) => {
      if (isEmote(payload.message)) {
        setEmotes((current) => ({
          ...current,
          [payload.seat]: { emoji: payload.message, at: Date.now() },
        }));
        return;
      }
      setVisibleThought({ name: payload.name, message: payload.message });
      later(() => setVisibleThought(null), 4000);
    });

    return () => {
      client.disconnect();
      closeCues();
      for (const id of timers.current) if (id) clearTimeout(id);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, playerId]);

  /**
   * Everything the table should notice: a new deal, the contract landing, a
   * partner outed, a trick taken.
   */
  useEffect(() => {
    if (!view) {
      seenStateRef.current = false;
      trickNumberRef.current = 0;
      phaseRef.current = null;
      revealedRef.current = {};
      setPresentedTrick(null);
      return;
    }

    const first = !seenStateRef.current;
    const previousTrick = trickNumberRef.current;
    const previousPhase = phaseRef.current;
    const previousRevealed = revealedRef.current;
    seenStateRef.current = true;
    trickNumberRef.current = view.trickNumber;
    phaseRef.current = view.phase;
    revealedRef.current = view.revealed;

    if (first) {
      // Joining a table that is already playing should not replay the deal.
      if (view.phase === 'BIDDING' && view.bidLog.length === 0) {
        setEnteringGame(true);
        playCue('start');
        later(() => {
          setEnteringGame(false);
          // Only now is the table on screen, so this is when cards can be seen
          // arriving at the seats.
          setIsDealing(true);
          later(() => setIsDealing(false), 1000);
        }, 1600);
      }
      return;
    }

    // A fresh hand: the previous one had finished, and bidding has reopened.
    if (
      view.phase === 'BIDDING' &&
      view.bidLog.length === 0 &&
      (previousPhase === 'FINISHED' || previousPhase === 'PASSED_OUT')
    ) {
      playCue('start');
      setPresentedTrick(null);
      setIsDealing(true);
      later(() => setIsDealing(false), 1000);
    }

    // The auction closed and somebody owns the hand.
    if (previousPhase === 'BIDDING' && view.phase === 'CALLING') playCue('bid');

    // Trump is named. Mendi Coat flashes this on the cut; here it is the
    // moment the contract is locked in, which is the same beat in the hand.
    if (previousPhase === 'CALLING' && view.phase === 'PLAYING' && view.trumpSuit) {
      setTrumpReveal(view.trumpSuit);
      playCue('trump');
      later(() => setTrumpReveal(null), 2400);
    }

    // A called card has landed, so somebody is no longer anonymous. This is the
    // game's own moment — the whole point of playing with hidden partners.
    for (const [code, holder] of Object.entries(view.revealed)) {
      if (previousRevealed[code] !== undefined) continue;
      const name = view.players[holder]?.name ?? `Seat ${holder + 1}`;
      setRevealed({ name, card: code });
      playCue('reveal');
      later(() => setRevealed(null), 2600);
    }

    if (view.trickNumber > previousTrick && view.lastTrick) {
      playCue('trick');
      // The server folds the last card straight into lastTrick, so the state
      // that reports a finished trick has already emptied trickCards. Hold the
      // cards face up here or nobody ever sees the one that won it.
      const { cards, winner } = view.lastTrick;
      setPresentedTrick({ trickNumber: view.trickNumber, cards, winner, phase: 'hold' });
      later(
        () => setPresentedTrick((current) => (current ? { ...current, phase: 'sweep' } : null)),
        TRICK_HOLD_MS,
      );
      later(() => setPresentedTrick(null), TRICK_HOLD_MS + TRICK_SWEEP_MS);
    } else if (view.trickCards.length > 0) {
      playCue('card');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // While a finished trick is being presented it takes precedence over live
  // cards, so a fast next player cannot cut the moment short.
  const collectedBy = presentedTrick?.phase === 'sweep' ? presentedTrick.winner : null;
  const tablePlays = presentedTrick ? presentedTrick.cards : (view?.trickCards ?? []);

  // Measure the trip to the winner's card. Runs after the cards are on screen,
  // so the first frame shows them at home and the sweep starts from there.
  useEffect(() => {
    if (collectedBy === null) {
      setSweepOffsets(null);
      return;
    }
    const target = cardRefs.current[collectedBy];
    if (!target) return;
    const targetRect = target.getBoundingClientRect();
    const offsets: Record<number, { x: number; y: number; rotation: number }> = {};
    cardRefs.current.forEach((element, index) => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      offsets[index] = {
        x: Math.round(targetRect.left - rect.left),
        y: Math.round(targetRect.top - rect.top),
        // Splay each card a little so the landed trick reads as a pile rather
        // than one card, since they all arrive on the same spot.
        rotation: [-9, -5, -1, 3, 7, 10, 13][index] ?? 0,
      };
    });
    setSweepOffsets(offsets);
  }, [collectedBy, presentedTrick?.trickNumber]);

  const phase = view?.phase ?? null;

  // The seats and the log are for between hands. Once cards are out they are
  // just height above the table, so they fold themselves away.
  useEffect(() => {
    if (phase && phase !== 'FINISHED') {
      setSeatsOpen(false);
      setHistoryOpen(false);
    }
    if (phase === null) setSeatsOpen(true);
  }, [phase]);

  // Where the eye should be. On a phone the board and the result are far apart
  // in one long column, and players were finishing a hand without seeing it end.
  useEffect(() => {
    if (enteringGame) return;
    const target =
      phase === 'FINISHED' ? outcomeRef.current : phase !== null ? boardRef.current : null;
    if (!target) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // A hand ends on the last card of the last trick, which is still being held
    // face up and swept to the winner. Scrolling at once would pull the table
    // away mid-sweep.
    const pause = phase === 'FINISHED' ? END_OF_HAND_PAUSE_MS : 0;
    const timer = later(
      () => target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' }),
      pause,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, enteringGame]);

  function flash(message?: string) {
    if (!message) return;
    setMoveError(message);
    playCue('invalid');
    later(() => setMoveError(null), 2600);
  }

  const send = (event: string, payload: Record<string, unknown> = {}) =>
    socket?.emit(event, { roomCode, ...payload }, (result: { error?: string }) =>
      flash(result?.error),
    );

  function sendThought(event: FormEvent) {
    event.preventDefault();
    const message = thoughtInput.trim();
    if (!message) return;
    socket?.emit('tigdi:thought', { roomCode, message }, (result: { error?: string }) => {
      if (result?.error) flash(result.error);
      else setThoughtInput('');
    });
  }

  if (!isConnected) {
    return <LoadingScreen message="Connecting to the table…" fullScreen={false} />;
  }
  if (enteringGame) {
    return <LoadingScreen message="Dealing the cards…" fullScreen={false} />;
  }

  const isAdmin = room.admin?.id === playerId;
  const adminName = room.admin?.name ?? 'the host';
  const waitingOnAdmin = `Only ${adminName} can run this table`;
  const seated = room.players.filter(Boolean).length;
  const tableFull = seated === room.seatCount;
  const me = view && seat !== null ? view.players[seat] : null;
  const myHand = me?.cards ?? [];
  const myTurn = view !== null && seat !== null && view.currentTurn === seat;
  const handOver = view?.phase === 'FINISHED';

  return (
    <div
      className={`room-dashboard ${view ? 'has-active-game' : 'waiting-room-dashboard'} flex flex-col gap-4`}
    >
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}

      <div className="room-sidebar flex flex-col gap-4">
        {/* ── Who is here ─────────────────────────────────────────────────── */}
        <section className="live-room-panel rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <button
            type="button"
            onClick={() => setSeatsOpen((open) => !open)}
            aria-expanded={seatsOpen}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="flex items-center gap-2">
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                  seatsOpen ? '' : '-rotate-90'
                }`}
                aria-hidden="true"
              />
              <span className="text-lg font-semibold text-white">Live room</span>
            </span>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-rose-500/10 px-3 py-1 text-sm text-rose-300">
              {seated}/{room.seatCount}
            </span>
          </button>

          <div className={`mt-4 grid gap-2 sm:grid-cols-2 ${seatsOpen ? '' : 'hidden'}`}>
            {Array.from({ length: room.seatCount }, (_, index) => {
              const occupant = room.players[index] ?? null;
              return (
                <div
                  key={index}
                  className="flex items-center justify-between gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm"
                >
                  <span className="live-seat-label shrink-0 text-slate-400">S{index + 1}</span>
                  <span
                    className={`live-seat-name inline-flex min-w-0 items-center justify-end gap-1.5 ${
                      occupant?.isBot ? 'text-rose-300' : 'font-medium text-white'
                    }`}
                  >
                    {occupant && !occupant.isBot ? (
                      <span
                        title={occupant.isOnline ? 'Online' : 'Offline'}
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-slate-900 ${
                          occupant.isOnline ? 'bg-emerald-400' : 'bg-slate-600'
                        }`}
                      />
                    ) : null}
                    {occupant && !occupant.isBot ? (
                      <Avatar
                        avatar={occupant.avatar}
                        userKey={occupant.id}
                        name={occupant.name}
                        className="h-6 w-6 shrink-0"
                      />
                    ) : null}
                    <span className="min-w-0">
                      <span className="block truncate">
                        {occupant ? `${occupant.name}${occupant.isBot ? ' · Bot' : ''}` : 'Open'}
                      </span>
                      {occupant?.title ? (
                        <span className="block truncate text-[10px] font-medium text-rose-300/80">
                          {occupant.title}
                        </span>
                      ) : null}
                      {occupant && room.admin?.id === occupant.id ? (
                        <span className="block truncate text-[10px] font-medium uppercase tracking-wider text-emerald-300/90">
                          {room.admin.isHost ? 'Host' : 'Acting host'}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Table size and dealing: only before a hand is out. */}
          {!view ? (
            <div className="mt-4 border-t border-slate-800 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Table of</span>
                {[5, 6, 7].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => send('tigdi:set-seats', { count })}
                    disabled={!isAdmin}
                    aria-pressed={room.seatCount === count}
                    title={isAdmin ? `Play with ${count}` : waitingOnAdmin}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      room.seatCount === count
                        ? 'border-rose-400 bg-rose-400/15 text-rose-300'
                        : 'border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {count}
                  </button>
                ))}
                <span className="ml-auto text-xs text-slate-500">
                  {room.calls} call{room.calls === 1 ? '' : 's'} · from {room.minBid}
                </span>
              </div>

              {isAdmin ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => send('tigdi:start')}
                    disabled={!tableFull}
                    title={tableFull ? undefined : 'Every seat has to be filled first'}
                    className="flex-1 rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-rose-950 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Deal
                  </button>
                  <button
                    type="button"
                    onClick={() => send('tigdi:fill-bots')}
                    disabled={tableFull}
                    className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add bots
                  </button>
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-center text-sm text-slate-400">
                  Waiting for <span className="font-semibold text-slate-200">{adminName}</span> to
                  deal
                </p>
              )}
            </div>
          ) : null}
        </section>

        {/* ── Who is winning the night ───────────────────────────────────── */}
        {room.history.length > 0 ? (
          <Standings players={room.players} scores={room.scores} played={room.history.length} />
        ) : null}

        {/* ── The night so far ─────────────────────────────────────────────
            Hidden until there is one. An empty log in a fresh lobby is a panel
            that says nothing, above the only thing that matters there — who is
            here and whether we can start. */}
        {room.history.length > 0 ? (
          <section className="match-history-panel rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <button
              type="button"
              onClick={() => setHistoryOpen((open) => !open)}
              aria-expanded={historyOpen}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="flex items-center gap-2">
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                    historyOpen ? '' : '-rotate-90'
                  }`}
                  aria-hidden="true"
                />
                <span className="text-lg font-semibold text-white">Hands</span>
              </span>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {room.history.length} played
              </span>
            </button>

            <div className={`mt-3 space-y-2 ${historyOpen ? '' : 'hidden'}`}>
              {[...room.history].reverse().map((hand, index) => (
                <div
                  key={room.history.length - index}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-900 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-slate-300">
                    {hand.names[hand.bidderSeat]}{' '}
                    <span className="text-slate-500">
                      bid {hand.bid} {SUIT_GLYPH[hand.trumpSuit]}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      hand.made ? 'bg-rose-500/20 text-rose-200' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {hand.points.BIDDER} · {hand.made ? 'made' : 'broken'}
                  </span>
                </div>
              ))}
            </div>

        </section>
        ) : null}

        {/* ── Saying something ─────────────────────────────────────────────
            Only once cards are out, the way the Mendi Coat table does it. In a
            lobby the table is still assembling and there is nothing yet to
            react to. */}
        {view && seat !== null ? (
          <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            {visibleThought ? (
              <p className="mb-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-300">
                <span className="font-semibold text-rose-300">{visibleThought.name}:</span>{' '}
                {visibleThought.message}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {EMOTES.map((emote) => (
                <button
                  key={emote.emoji}
                  type="button"
                  onClick={() => socket?.emit('tigdi:thought', { roomCode, message: emote.emoji })}
                  title={emote.label}
                  aria-label={emote.label}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-lg leading-none transition hover:border-rose-400/60 hover:bg-slate-800 active:translate-y-0.5"
                >
                  {emote.emoji}
                </button>
              ))}
            </div>
            <form
              onSubmit={sendThought}
              className="mt-2 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1"
            >
              <button
                type="button"
                onClick={voice.toggleMic}
                aria-pressed={voice.micOn}
                title={voice.micOn ? 'Mute your microphone' : 'Speak to the table'}
                className={`shrink-0 rounded-md p-1.5 transition ${
                  voice.micOn
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                {voice.micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={voice.toggleSpeaker}
                aria-pressed={voice.speakerOn}
                title={voice.speakerOn ? 'Mute other players' : 'Hear other players'}
                className={`shrink-0 rounded-md p-1.5 transition ${
                  voice.speakerOn
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                {voice.speakerOn ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
              </button>
              <input
                value={thoughtInput}
                onChange={(event) => setThoughtInput(event.target.value)}
                maxLength={80}
                placeholder="Say something…"
                className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm text-white outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                className="shrink-0 rounded-md bg-rose-400 px-3 py-1 text-xs font-semibold text-rose-950"
              >
                Send
              </button>
            </form>
            {voice.peerCount > 0 ? (
              <p className="mt-2 text-xs text-emerald-300/80">
                {voice.peerCount} {voice.peerCount === 1 ? 'other player is' : 'other players are'}{' '}
                on the call
              </p>
            ) : null}
            {voice.error ? (
              <p role="alert" className="mt-2 text-xs text-rose-300">
                {voice.error}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      {/* ── The board ─────────────────────────────────────────────────────── */}
      {view ? (
        <section
          ref={boardRef}
          className="active-game-panel space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 sm:space-y-4 sm:p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-950/40 px-2.5 py-2">
            <span className="rounded-full bg-rose-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-rose-200">
              {view.phase === 'BIDDING'
                ? 'Bidding'
                : view.phase === 'CALLING'
                  ? 'Calling partners'
                  : view.phase === 'FINISHED'
                    ? 'Hand over'
                    : `Trick ${view.trickNumber}`}
            </span>
            <div className="flex items-center gap-2 text-xs">
              {view.highBid ? (
                <span className="rounded-md bg-slate-900/80 px-2 py-1 font-semibold tabular-nums text-amber-200">
                  {view.highBid}
                </span>
              ) : null}
              <span
                className={`rounded-md bg-slate-900/80 px-2 py-1 text-base leading-none ${
                  view.trumpSuit
                    ? view.trumpSuit === 'HEARTS' || view.trumpSuit === 'DIAMONDS'
                      ? 'text-rose-400'
                      : 'text-slate-100'
                    : 'text-slate-600'
                }`}
                title={view.trumpSuit ? `${view.trumpSuit} is trump` : 'Trump not named yet'}
              >
                {view.trumpSuit ? SUIT_GLYPH[view.trumpSuit] : '—'}
              </span>
              {/* Whose move it is, which is the one thing you look up mid-hand. */}
              <span className="flex items-center gap-1.5 rounded-md bg-amber-300 px-2 py-1 font-semibold text-emerald-950">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-800" />
                <span className="max-w-[7rem] truncate">
                  {view.players[view.currentTurn]?.name}
                </span>
              </span>
            </div>
          </div>

          <div className="game-play-layout">
            <TigdiTable
              view={view}
              players={room.players}
              emotes={emotes}
              tablePlays={tablePlays}
              collectedBy={collectedBy}
              sweepOffsets={sweepOffsets}
              cardRefs={cardRefs}
              isDealing={isDealing}
              moveError={moveError}
              trumpReveal={trumpReveal}
              revealed={revealed}
            />

            <div className="game-sidebar space-y-4">
              {/* What this seat has to decide right now, above the cards it
                  would decide it with. */}
              {view.phase === 'BIDDING' || view.phase === 'CALLING' ? (
                <BiddingPanel
                  view={view}
                  onBid={(amount) => send('tigdi:bid', { amount })}
                  onContract={(trumpSuit, calledCards) =>
                    send('tigdi:contract', { trumpSuit, calledCards })
                  }
                />
              ) : null}

              {view.phase === 'PASSED_OUT' ? (
                <p className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-center text-sm text-slate-300">
                  Nobody wanted it. Dealing again…
                </p>
              ) : null}

              <div className="game-hand rounded-lg bg-slate-950/60 p-3 sm:p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-slate-400">
                    Your hand {seat === null ? '' : `(Seat ${seat + 1})`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {view.phase !== 'PLAYING'
                      ? null
                      : myTurn
                        ? 'Your turn'
                        : `Waiting on ${view.players[view.currentTurn]?.name}`}
                  </p>
                </div>
                <div className="mt-2 flex items-end overflow-x-auto px-4 pb-3 pt-8">
                  {myHand.map((card, index) => {
                    // Your move, and this card is one the rules allow.
                    const yourMove = myTurn && view.phase === 'PLAYING';
                    const playable = yourMove && isLegal(view, card);
                    // Dim only what is actually being refused — a card you may
                    // not play *now*, on a turn you actually have. Through the
                    // auction, and while you are waiting, the hand is just your
                    // hand and should look like it.
                    const refused = yourMove && !playable;
                    return (
                      <button
                        key={card.code}
                        type="button"
                        // Deliberately NOT `disabled`. A disabled control gets no
                        // pointer events in most browsers, so :hover never
                        // matches and the whole hand goes dead to the mouse —
                        // and the lift is how you read a fanned hand at all,
                        // sliding along to see what you are holding. So the
                        // button stays live and refuses the click instead.
                        aria-disabled={!playable}
                        onClick={() => {
                          if (playable) {
                            send('tigdi:play', { card });
                            return;
                          }
                          // Silence when it is simply not your turn; a reason
                          // only when you tried to play the wrong card.
                          if (yourMove) flash('Follow the led suit while you hold it.');
                        }}
                        aria-label={cardLabel(card)}
                        className={`animate-deal-in relative h-24 w-[4.5rem] shrink-0 rounded-lg transition hover:z-20 hover:-translate-y-5 sm:h-28 sm:w-20 ${
                          refused ? 'cursor-not-allowed brightness-[0.45] saturate-50' : ''
                        } ${
                          // On your turn the cards you may play stand proud of
                          // the rest, so the choice reads before you touch it.
                          playable ? '-translate-y-2 drop-shadow-[0_0_12px_rgba(251,191,36,0.35)]' : ''
                        } ${index === 0 ? '' : '-ml-2 sm:-ml-3'}`}
                        // Runs when the hand first mounts, which is exactly the
                        // deal. Cards are only removed after that.
                        style={{ animationDelay: `${index * 45}ms` } as CSSProperties}
                      >
                        <PlayingCard
                          card={card}
                          className="h-full w-full drop-shadow-[0_8px_14px_rgba(0,0,0,0.6)]"
                        />
                        {cardPoints(card) > 0 ? (
                          <span className="absolute -top-1.5 right-0 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">
                            {cardPoints(card)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="game-scores grid gap-3 sm:grid-cols-2">
                <ContractCard view={view} />
                <PointsCard view={view} />
              </div>

              {handOver && view.result ? (
                <div ref={outcomeRef} className="scroll-mt-4">
                  <HandResult
                    view={view}
                    isAdmin={isAdmin}
                    adminName={adminName}
                    onNext={() => send('tigdi:next-hand')}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Who is winning the night.
 *
 * A room plays hand after hand, and until now the only trace of that was a list
 * of results nobody could read a standing off. This is the standing: a point
 * for every hand you finished on the winning side, whichever side that was.
 *
 * It counts sides rather than bids on purpose — a partner who never bid but
 * kept breaking other people's contracts has had a good night, and the table
 * knows it even if the scoreboard used not to.
 */
function Standings({
  players,
  scores,
  played,
}: {
  players: Array<TigdiSeatPlayer | null>;
  scores: number[];
  played: number;
}) {
  const rows = scores
    .map((wins, seat) => ({ seat, wins, player: players[seat] ?? null }))
    .sort((a, b) => b.wins - a.wins || a.seat - b.seat);
  const most = Math.max(1, ...scores);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Standings</h2>
        <span className="shrink-0 rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
          {played} hand{played === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        {rows.map((row, place) => {
          // Only a clear outright leader gets the crown; a three-way tie on one
          // win each is not a leader.
          const leading = row.wins > 0 && row.wins === most && rows[1]?.wins !== row.wins;
          return (
            <div key={row.seat} className="flex items-center gap-2">
              <span className="w-4 shrink-0 text-center text-[11px] tabular-nums text-slate-500">
                {leading ? '👑' : place + 1}
              </span>
              {row.player && !row.player.isBot ? (
                <Avatar
                  avatar={row.player.avatar}
                  userKey={row.player.id}
                  name={row.player.name}
                  className="h-5 w-5 shrink-0"
                />
              ) : (
                <span className="h-5 w-5 shrink-0 rounded-full bg-slate-800" />
              )}
              <span
                className={`min-w-0 flex-1 truncate text-sm ${
                  row.player?.isBot ? 'text-rose-300/80' : 'text-slate-200'
                }`}
              >
                {row.player?.name ?? `Seat ${row.seat + 1}`}
              </span>
              {/* The bar makes a run of wins visible at a glance, which a
                  column of numbers does not. */}
              <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-800">
                <span
                  className="block h-full rounded-full bg-rose-400 transition-all duration-500"
                  style={{ width: `${(row.wins / most) * 100}%` }}
                />
              </span>
              <span className="w-4 shrink-0 text-right text-sm font-semibold tabular-nums text-white">
                {row.wins}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Whether a card can be played, by the same rule the server applies. Purely so
 * an illegal card looks dead rather than being refused after the click — the
 * server still decides.
 */
function isLegal(view: TigdiView, card: Card): boolean {
  if (view.trickCards.length === 0) return true;
  const leadSuit = view.trickCards[0].card.suit;
  const hand = view.you === null ? [] : (view.players[view.you]?.cards ?? []);
  const canFollow = hand.some((entry) => entry.suit === leadSuit);
  return !canFollow || card.suit === leadSuit;
}

/** The contract: what was bid, what is trump, and which cards were called. */
function ContractCard({ view }: { view: TigdiView }) {
  if (view.highBid === null) {
    return (
      <div className="rounded-lg bg-slate-950/60 p-3">
        <p className="font-medium text-white">The contract</p>
        <p className="mt-1 text-sm text-slate-400">Nobody has bought the hand yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-slate-950/60 p-3">
      <p className="font-medium text-white">
        {view.players[view.highBidder!]?.name} · {view.highBid}
        {view.trumpSuit ? ` ${SUIT_GLYPH[view.trumpSuit]}` : ''}
      </p>
      {view.calledCards.length > 0 ? (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Called</p>
          {view.calledCards.map((code) => {
            const holder = view.revealed[code];
            return (
              <div
                key={code}
                className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-xs ${
                  holder === undefined
                    ? 'border border-dashed border-slate-700 text-slate-400'
                    : 'bg-rose-500/15 text-rose-200'
                }`}
              >
                <span className="font-semibold">{code}</span>
                <span className="truncate">
                  {holder === undefined ? 'unknown' : view.players[holder]?.name}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-1 text-sm text-slate-400">Partners not called yet.</p>
      )}
    </div>
  );
}

/**
 * The scoresheet, kept the way a player at the table keeps one.
 *
 * It shows what each *seat* has captured, never what each side has, because
 * only the first of those is public. Everyone watched every trick, so everyone
 * knows Bot 3 has taken 45 points; whether those 45 belong to the bidder is the
 * question the hand is about. Adding the seats you have placed into a side, and
 * seeing how much is still unaccounted for, is the whole of the deduction — so
 * the panel does that arithmetic and stops exactly where the knowledge stops.
 *
 * Once the hand is over the server sends the real totals and they are shown.
 */
function PointsCard({ view }: { view: TigdiView }) {
  // Defaulted rather than trusted. The socket server is a separate long-lived
  // process from the page: in development Next hot-reloads this component while
  // the server keeps running the engine it booted with, so a hand dealt a
  // moment ago can be missing a field this build expects. A stale field is
  // worth an empty column; it is not worth throwing away the whole table.
  const pointsBySeat = view.pointsBySeat ?? [];
  const tricksBySeat = view.tricksBySeat ?? [];
  const captured = pointsBySeat.reduce((sum, points) => sum + points, 0);
  const unplayed = TOTAL_POINTS - captured;

  // Only seats whose side is public can be added up. Everyone else's points sit
  // in "unplaced", which is precisely what you are trying to work out.
  const placed = { BIDDER: 0, OPPONENT: 0, unknown: 0 };
  view.players.forEach((player) => {
    const points = pointsBySeat[player.seat] ?? 0;
    if (player.team === 'BIDDER') placed.BIDDER += points;
    else if (player.team === 'OPPONENT') placed.OPPONENT += points;
    else placed.unknown += points;
  });

  const bid = view.highBid;
  const final = view.points;

  return (
    <div className="rounded-lg bg-slate-950/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium text-white">Points</p>
        <p className="text-[11px] text-slate-500">{unplayed} still out there</p>
      </div>

      {bid !== null ? (
        <>
          {/* Solid is what can be pinned on the bidder's side; the faint band
              beside it is everything captured by a seat nobody has placed yet,
              which could still land either way. */}
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-rose-400 transition-all duration-500"
              style={{ width: `${Math.min(100, ((final?.BIDDER ?? placed.BIDDER) / bid) * 100)}%` }}
            />
            {final ? null : (
              <div
                className="h-full bg-rose-400/25 transition-all duration-500"
                style={{ width: `${Math.min(100, (placed.unknown / bid) * 100)}%` }}
              />
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            {final
              ? `${final.BIDDER} against a bid of ${bid}.`
              : `${placed.BIDDER} of ${bid} placed with the bidder · ${placed.unknown} unplaced`}
          </p>
        </>
      ) : null}

      <div className="mt-2.5 space-y-1">
        {view.players.map((player) => {
          const points = pointsBySeat[player.seat] ?? 0;
          return (
            <div key={player.seat} className="flex items-center gap-2 text-xs">
              <span
                className={`w-9 shrink-0 rounded px-1 text-center text-[9px] font-bold uppercase tracking-wider ${
                  player.team === 'BIDDER'
                    ? 'bg-rose-500/25 text-rose-200'
                    : player.team === 'OPPONENT'
                      ? 'bg-slate-700/70 text-slate-300'
                      : 'bg-slate-800 text-amber-200/60'
                }`}
                title={
                  player.team === 'BIDDER'
                    ? "On the bidder's side"
                    : player.team === 'OPPONENT'
                      ? 'Against the bidder'
                      : 'Side not known yet'
                }
              >
                {player.team === 'BIDDER'
                  ? player.seat === view.highBidder
                    ? 'bid'
                    : 'with'
                  : player.team === 'OPPONENT'
                    ? 'vs'
                    : '?'}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-300">{player.name}</span>
              <span className="shrink-0 tabular-nums text-slate-500">
                {tricksBySeat[player.seat] ?? 0}t
              </span>
              <span
                className={`w-8 shrink-0 text-right font-semibold tabular-nums ${
                  points > 0 ? 'text-white' : 'text-slate-600'
                }`}
              >
                {points}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The reveal: who was on whose side all along, and whether the bid held. */
function HandResult({
  view,
  isAdmin,
  adminName,
  onNext,
}: {
  view: TigdiView;
  isAdmin: boolean;
  adminName: string;
  onNext: () => void;
}) {
  const result = view.result!;
  const side = (team: 'BIDDER' | 'OPPONENT') =>
    view.players.filter((player) => player.team === team).map((player) => player.name);

  return (
    <div className="space-y-3">
      <p
        className={`rounded-lg border py-3 text-center text-xl font-semibold text-white ${
          result.made ? 'border-rose-400/50 bg-rose-400/10' : 'border-slate-600 bg-slate-800/60'
        }`}
      >
        {result.made
          ? `Bid made — ${result.points.BIDDER} against ${result.bid}`
          : `Bid broken — ${result.points.BIDDER} of ${result.bid}`}
      </p>

      <div className="divide-y divide-slate-800 rounded-lg bg-slate-950/60">
        <div className="p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-rose-300">
            Bidder&rsquo;s side · {result.points.BIDDER}
          </p>
          <p className="mt-1 text-sm text-white">{side('BIDDER').join(', ')}</p>
          <p className="mt-1 text-xs text-slate-400">
            {view.players[result.bidderSeat]?.name} called {result.calledCards.join(' and ')} with{' '}
            {SUIT_GLYPH[result.trumpSuit]} as trump.
          </p>
        </div>
        <div className="p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
            Against · {result.points.OPPONENT}
          </p>
          <p className="mt-1 text-sm text-white">{side('OPPONENT').join(', ')}</p>
        </div>
      </div>

      {isAdmin ? (
        <button
          type="button"
          onClick={onNext}
          className="w-full rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-rose-950 transition hover:bg-rose-400"
        >
          Deal the next hand
        </button>
      ) : (
        <p className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-center text-sm text-slate-400">
          Waiting for <span className="font-semibold text-slate-200">{adminName}</span> to deal
          again
        </p>
      )}
    </div>
  );
}
