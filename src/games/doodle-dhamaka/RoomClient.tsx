'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useVoiceChat } from '@/components/useVoiceChat';
import { closeCues, playCue } from '@/lib/table-cues';
import { DoodleCanvas, type CanvasEffects } from './Canvas';
import { ROULETTE_MS, brushesFor, hasDhamaka } from './dhamakas';
import { Lobby, type DoodleRoomPayload } from './Lobby';
import {
  ActiveDhamakas,
  ChoosePanel,
  DhamakaChips,
  DhamakaReveal,
  Feed,
  FinalResults,
  GuessBar,
  RoundResultCard,
  Scoreboard,
  Toolbar,
  inksFor,
  type SeatInfo,
} from './Panels';
import { DOODLE_REACTIONS } from './reactions';
import type { DoodleView, DrawOp, Stroke } from './types';
import type { GuessOutcome } from './engine';

/**
 * A Doodle Dhamaka table.
 *
 * The same rule as the other games holds here: the page is never sent the
 * answer unless this player is allowed to know it. The server builds a view for
 * each player, so there is nothing in this file hiding a secret — only drawing
 * what arrives.
 *
 * The drawing itself travels separately. It is not a secret, and it arrives in
 * a steady stream of small pieces, so it is kept in a ref and painted straight
 * onto the canvas rather than pushed through React state a hundred times a
 * second.
 */

interface DoodleRoomClientProps {
  roomCode: string;
  playerId: string;
  playerName: string;
  playerAvatar: string | null;
  playerTitle: string | null;
}

/** How long the Dhamaka reveal holds the canvas before the word choice shows. */
const REVEAL_MS = 3_200;
const TOAST_MS = 1_800;

type Feedback = { text: string; tone: 'good' | 'bad' | 'hot' | 'warm' | 'cold' } | null;
type Op = { kind: 'start'; stroke: Stroke } | Exclude<DrawOp, { kind: 'start' }>;

export function DoodleRoomClient({ roomCode, playerId, playerName, playerAvatar, playerTitle }: DoodleRoomClientProps) {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<DoodleRoomPayload | null>(null);
  const [view, setView] = useState<DoodleView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Server time, as best this browser can tell: the timer and every effect
  // that depends on how far into the round we are read this, not Date.now().
  const offsetRef = useRef(0);
  const [clock, setClock] = useState(() => Date.now());

  const strokesRef = useRef<Stroke[]>([]);
  const canvasRoundRef = useRef(0);
  const [version, setVersion] = useState(0);
  const repaint = useCallback(() => setVersion((value) => value + 1), []);

  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState('#1f1b2e');
  const [size, setSize] = useState(9);
  const [strokeSpent, setStrokeSpent] = useState(false);

  const [guess, setGuess] = useState('');
  const [lock, setLock] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [revealUntil, setRevealUntil] = useState(0);
  const [reactions, setReactions] = useState<Array<{ id: number; emoji: string; left: number }>>([]);

  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current = timers.current.filter((entry) => entry !== id);
      fn();
    }, ms);
    timers.current.push(id);
  }, []);

  const flash = useCallback(
    (message: string) => {
      setNotice(message);
      later(() => setNotice((current) => (current === message ? null : current)), 2_600);
    },
    [later],
  );

  const voice = useVoiceChat(socket, roomCode);

  // ── The connection ────────────────────────────────────────────────────────
  useEffect(() => {
    const client = io({ path: '/socket.io' });
    setSocket(client);
    const hello = () => {
      setConnected(true);
      client.emit('doodle:watch', { roomCode });
      client.emit('doodle:join', { roomCode, playerId, playerName, playerAvatar, playerTitle });
    };
    client.on('connect', hello);
    client.on('disconnect', () => setConnected(false));
    if (client.connected) hello();

    client.on('doodle:room', (payload: DoodleRoomPayload) => setRoom(payload));
    client.on('doodle:state', (payload: DoodleView | null) => {
      if (payload) offsetRef.current = payload.serverNow - Date.now();
      setView(payload);
    });
    client.on('doodle:error', (message: string) => flash(message));
    client.on('doodle:closed', () => {
      flash('The host closed this room.');
      router.replace('/games/doodle-dhamaka');
    });

    // The whole drawing, for a new round or a page that fell out of step.
    client.on('doodle:canvas', ({ round, strokes }: { round: number; strokes: Stroke[] }) => {
      canvasRoundRef.current = round;
      strokesRef.current = strokes.map((stroke) => ({ ...stroke, points: [...stroke.points] }));
      repaint();
    });

    // One piece of the drawing, as the drawer makes it.
    client.on('doodle:op', ({ round, op }: { round: number; op: Op }) => {
      if (round !== canvasRoundRef.current) {
        if (round < canvasRoundRef.current) return;
        canvasRoundRef.current = round;
        strokesRef.current = [];
      }
      const strokes = strokesRef.current;
      switch (op.kind) {
        case 'start':
          strokes.push({ ...op.stroke, points: [...op.stroke.points] });
          break;
        case 'points':
          strokes.find((stroke) => stroke.id === op.id)?.points.push(...op.points);
          break;
        case 'end': {
          const stroke = strokes.find((entry) => entry.id === op.id);
          if (stroke) stroke.done = true;
          break;
        }
        case 'undo':
          strokes.pop();
          break;
        case 'clear':
          strokesRef.current = [];
          break;
      }
      repaint();
    });

    client.on('doodle:reacted', ({ emoji }: { playerId: string; emoji: string }) => {
      const id = Date.now() + Math.random();
      setReactions((current) => [...current.slice(-12), { id, emoji, left: 8 + Math.random() * 84 }]);
      setTimeout(() => setReactions((current) => current.filter((entry) => entry.id !== id)), 2_600);
    });

    return () => {
      client.disconnect();
      closeCues();
      for (const id of timers.current) clearTimeout(id);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, playerId]);

  // A quarter-second clock drives the timer, the hints' arrival and the
  // canvas effects that begin partway through a round.
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now() + offsetRef.current), 250);
    return () => clearInterval(timer);
  }, []);

  // ── Moments worth noticing ────────────────────────────────────────────────
  const previous = useRef<{ round: number; phase: string | null; feedTop: number }>({ round: 0, phase: null, feedTop: 0 });
  useEffect(() => {
    if (!view) {
      previous.current = { round: 0, phase: null, feedTop: 0 };
      return;
    }
    const before = previous.current;
    const round = view.round;
    const feedTop = round.feed.at(-1)?.id ?? 0;

    if (round.number !== before.round && view.phase !== 'GAME_OVER') {
      // A new round: new canvas, new rules, and a moment to take them in.
      if (canvasRoundRef.current !== round.number) {
        canvasRoundRef.current = round.number;
        strokesRef.current = [];
        repaint();
      }
      setStrokeSpent(false);
      setLock(false);
      setFeedback(null);
      setTool('pen');
      const brushes = brushesFor(round.dhamakas);
      setSize(brushes[Math.min(1, brushes.length - 1)]);
      if (round.onlyColor) setColor(round.onlyColor);
      if (before.round !== 0 || view.phase === 'CHOOSING') {
        setRevealUntil(Date.now() + offsetRef.current + REVEAL_MS);
        playCue('dhamaka');
      }
    }

    if (before.phase === 'DRAWING' && view.phase === 'ROUND_END' && round.result) {
      playCue(round.result.outcome === 'perfect' ? 'perfect' : round.result.outcome === 'disaster' ? 'disaster' : 'trick');
    }
    if (before.phase && before.phase !== 'GAME_OVER' && view.phase === 'GAME_OVER') playCue('coat');

    // Someone else got it: a small chime, so the table feels the pressure.
    if (before.round === round.number && feedTop > before.feedTop) {
      const fresh = round.feed.filter((entry) => entry.id > before.feedTop);
      if (fresh.some((entry) => entry.kind === 'correct' && entry.playerId !== playerId)) playCue('tap');
    }

    previous.current = { round: round.number, phase: view.phase, feedTop };
  }, [view, playerId, repaint]);

  // ── What this player is doing right now ───────────────────────────────────
  const round = view?.round;
  const dhamakas = round?.dhamakas ?? [];
  const isDrawer = round?.drawerId === playerId;
  const phase = view?.phase ?? null;

  const deadline =
    phase === 'CHOOSING' ? round?.choosingEndsAt : phase === 'DRAWING' ? round?.endsAt : phase === 'ROUND_END' ? round?.nextAt : undefined;
  const secondsLeft = deadline ? Math.max(0, Math.ceil((deadline - clock) / 1000)) : 0;
  const urgent = phase === 'DRAWING' && secondsLeft <= 10;

  const lastTick = useRef(-1);
  useEffect(() => {
    if (!urgent || secondsLeft === lastTick.current || secondsLeft === 0) return;
    lastTick.current = secondsLeft;
    playCue('tick');
  }, [urgent, secondsLeft]);

  const rouletteColor =
    round?.roulette && round.startedAt !== undefined
      ? round.roulette[Math.floor(Math.max(0, clock - round.startedAt) / ROULETTE_MS) % round.roulette.length]
      : null;
  const ink = rouletteColor ?? round?.onlyColor ?? color;

  const halfway = round?.startedAt !== undefined && clock - round.startedAt >= round.duration / 2;
  const effects: CanvasEffects = {
    hideFromSelf: isDrawer && phase === 'DRAWING' && hasDhamaka(dhamakas, 'blind-artist'),
    mirrorSelf: isDrawer && hasDhamaka(dhamakas, 'mirror-artist'),
    flipped: !isDrawer && phase === 'DRAWING' && hasDhamaka(dhamakas, 'flip') && halfway,
    fog: !isDrawer && phase === 'DRAWING' && hasDhamaka(dhamakas, 'fog'),
    vanishing: phase === 'DRAWING' && hasDhamaka(dhamakas, 'vanishing-lines'),
  };
  const oneStroke = hasDhamaka(dhamakas, 'one-stroke');
  const canErase = !oneStroke && !hasDhamaka(dhamakas, 'no-eraser');
  const canDraw = isDrawer && phase === 'DRAWING' && !(oneStroke && (strokeSpent || round?.strokeSpent));

  const mine = round?.yours ?? null;
  const solved = mine?.guessedAt !== undefined;
  const guessMode: 'guess' | 'chat-solved' | 'chat-all' | 'spent' =
    phase !== 'DRAWING'
      ? 'chat-all'
      : isDrawer || solved
        ? 'chat-solved'
        : hasDhamaka(dhamakas, 'one-guess') && (mine?.used ?? 0) >= 1
          ? 'spent'
          : 'guess';

  const seats = useMemo(
    () =>
      new Map<string, SeatInfo>(
        (room?.players ?? []).map((player) => [
          player.id,
          { id: player.id, name: player.name, avatar: player.avatar, isOnline: player.isOnline },
        ]),
      ),
    [room],
  );
  const names = useMemo(() => new Map((view?.players ?? []).map((player) => [player.id, player.name])), [view]);
  const isAdmin = room?.admin?.id === playerId;
  const adminName = room?.admin?.name ?? 'the host';

  // ── Sending ───────────────────────────────────────────────────────────────
  const emit = useCallback(
    (event: string, payload: Record<string, unknown> = {}, onOk?: (reply: Record<string, unknown>) => void) =>
      socket?.emit(event, { roomCode, ...payload }, (reply: { error?: string } & Record<string, unknown>) => {
        if (reply?.error) flash(reply.error);
        else onOk?.(reply ?? {});
      }),
    [socket, roomCode, flash],
  );

  const sendOp = useCallback(
    (op: DrawOp) => socket?.emit('doodle:draw', { roomCode, op }, (reply?: { error?: string }) => {
      if (reply?.error) flash(reply.error);
    }),
    [socket, roomCode, flash],
  );

  function submitGuess() {
    const text = guess.trim();
    if (!text || guessMode === 'spent') return;
    const locking = lock && guessMode === 'guess';
    socket?.emit('doodle:guess', { roomCode, text, lock: locking }, (reply: { error?: string; outcome?: GuessOutcome }) => {
      if (reply?.error) {
        setFeedback({ text: reply.error, tone: 'bad' });
        return;
      }
      setGuess('');
      setLock(false);
      const outcome = reply?.outcome;
      if (!outcome) return;
      if (outcome.kind === 'correct') {
        playCue('correct');
        setToast(`🎯 CORRECT! +${outcome.points.total}`);
        later(() => setToast(null), TOAST_MS);
        setFeedback({ text: `You got it! +${outcome.points.total}`, tone: 'good' });
      } else if (outcome.kind === 'lock-miss') {
        playCue('invalid');
        setFeedback({ text: `🔒 Locked and wrong — −${outcome.penalty}`, tone: 'bad' });
      } else if (outcome.kind === 'wrong' && outcome.warmth) {
        setFeedback(
          outcome.warmth === 'hot'
            ? { text: '🔥 Hot — you are very close', tone: 'hot' }
            : outcome.warmth === 'warm'
              ? { text: '🌤️ Getting warmer', tone: 'warm' }
              : { text: '❄️ Cold', tone: 'cold' },
        );
      } else if (outcome.kind === 'wrong') {
        setFeedback(null);
      }
    });
  }

  function undo() {
    strokesRef.current.pop();
    repaint();
    sendOp({ kind: 'undo' });
  }

  function clearCanvas() {
    strokesRef.current = [];
    repaint();
    sendOp({ kind: 'clear' });
  }

  function endGame() {
    if (window.confirm('End this game for everyone and go back to the lobby?')) emit('doodle:reset');
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  if (!connected) return <LoadingScreen message="Connecting to the table…" fullScreen={false} />;
  if (!room) return <LoadingScreen message="Setting out the paper…" fullScreen={false} />;

  const noticeBar = notice ? (
    <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-sm text-rose-200">
      {notice}
    </p>
  ) : null;

  if (!view) {
    return (
      <div className="flex flex-col gap-4">
        {noticeBar}
        <Lobby
          room={room}
          playerId={playerId}
          onAddWord={(text, done) => emit('doodle:add-word', { text }, done)}
          onRemoveWord={(text) => emit('doodle:remove-word', { text })}
          onToggleFriendWords={(on) => emit('doodle:friend-words', { on })}
          onStart={() => emit('doodle:start')}
        />
      </div>
    );
  }

  if (view.phase === 'GAME_OVER' && view.final) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {noticeBar}
        <FinalResults view={view} seats={seats} isAdmin={isAdmin} adminName={adminName} onReset={() => emit('doodle:reset')} />
      </div>
    );
  }

  const drawerName = names.get(view.round.drawerId) ?? 'Someone';
  const showReveal = phase === 'CHOOSING' && clock < revealUntil;

  return (
    <div className="doodle-game-shell">
      <div className="doodle-game-sidebar flex flex-col gap-4">
        <Scoreboard view={view} seats={seats} />

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
          <div className="flex flex-wrap gap-1.5">
            {DOODLE_REACTIONS.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => socket?.emit('doodle:react', { roomCode, emoji: reaction.emoji })}
                title={reaction.label}
                aria-label={reaction.label}
                className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xl leading-none transition hover:-translate-y-0.5 hover:border-amber-400/60 active:translate-y-0.5"
              >
                {reaction.emoji}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              onClick={voice.toggleMic}
              aria-pressed={voice.micOn}
              title={voice.micOn ? 'Mute your microphone' : 'Speak to the table'}
              className={`rounded-lg p-2 transition ${voice.micOn ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              {voice.micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={voice.toggleSpeaker}
              aria-pressed={voice.speakerOn}
              title={voice.speakerOn ? 'Mute other players' : 'Hear other players'}
              className={`rounded-lg p-2 transition ${voice.speakerOn ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              {voice.speakerOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <span className="ml-1 text-xs text-slate-500">
              {voice.peerCount > 0 ? `${voice.peerCount} on the call` : 'Voice chat'}
            </span>
            {isAdmin ? (
              <button
                type="button"
                onClick={endGame}
                className="ml-auto rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-400 transition hover:border-rose-400/60 hover:text-rose-300"
              >
                End game
              </button>
            ) : null}
          </div>
          {voice.error ? <p className="mt-1 text-xs text-rose-300">{voice.error}</p> : null}
        </section>
      </div>

      <section className="doodle-game-main space-y-3 rounded-2xl border border-emerald-400/25 bg-gradient-to-b from-emerald-500/10 to-slate-900/60 p-2 sm:space-y-4 sm:p-4">
        {noticeBar}

        {/* A short status bar first, then the persistent rule reminder below it. */}
        <div className="doodle-round-bar flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-950/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                Round {view.round.number}/{view.totalRounds}
              </span>
              <span className="truncate text-sm font-black uppercase tracking-wide text-amber-300 sm:text-base">
                🎨 {isDrawer ? 'You are drawing' : `${drawerName} is drawing`}
              </span>
            </p>
            {!isDrawer && view.yourTurnIn ? (
              <p className="mt-1 text-[11px] text-slate-400">
                Your turn to draw in {view.yourTurnIn} round{view.yourTurnIn === 1 ? '' : 's'}
              </p>
            ) : null}
          </div>
          <div
            className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border-2 sm:h-16 sm:w-16 ${
              urgent ? 'animate-urgent border-rose-400 bg-rose-500/20 text-rose-100' : 'border-amber-300/50 bg-slate-950/70 text-white'
            }`}
            aria-label={`${secondsLeft} seconds left`}
          >
            <span className="text-xl font-black tabular-nums leading-none sm:text-2xl">{secondsLeft}</span>
            <span className="text-[9px] uppercase tracking-wider opacity-60">sec</span>
          </div>
        </div>

        <ActiveDhamakas ids={dhamakas} combo={view.round.combo} />

        {/* The word, as much of it as this player may see. */}
        <div className="doodle-answer-strip flex min-h-12 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl bg-slate-950/70 px-3 py-2 text-center">
          {phase === 'DRAWING' && view.round.hint ? (
            <>
              <span className="font-mono text-xl font-black tracking-[0.18em] text-white sm:text-2xl">
                {view.round.hint.mask}
              </span>
              <span className="text-xs text-slate-500">{view.round.hint.letters} letters</span>
              {view.round.hint.category ? (
                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-bold text-sky-200">
                  {view.round.hint.emoji} {view.round.hint.category}
                </span>
              ) : null}
            </>
          ) : phase === 'DRAWING' && view.round.answer ? (
            <span className="text-lg font-black text-emerald-300 sm:text-xl">
              {isDrawer ? 'Draw: ' : '✓ You got it: '}
              {view.round.answer.emoji} {view.round.answer.text}
            </span>
          ) : phase === 'CHOOSING' ? (
            <span className="text-sm text-slate-400">{isDrawer ? 'Choose your word' : `${drawerName} is choosing a word…`}</span>
          ) : view.round.answer ? (
            <span className="text-lg font-black text-white">
              {view.round.answer.emoji} {view.round.answer.text}
            </span>
          ) : null}
          {view.round.suddenDeath ? (
            <span className="animate-urgent rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-950">
              ⚠️ Sudden death
            </span>
          ) : null}
        </div>

        <div className="doodle-play-area">
          <div className="doodle-canvas-column min-w-0 space-y-2">
            <div className="flex items-center justify-between px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
              <span>{canDraw ? 'Your drawing board' : 'Guess the drawing'}</span>
              {phase === 'DRAWING' ? <span className="text-emerald-300">{isDrawer ? 'Draw here' : 'Type below'}</span> : null}
            </div>
            <div className="relative">
              <DoodleCanvas
                strokesRef={strokesRef}
                version={version}
                canDraw={canDraw}
                tool={tool}
                color={ink}
                size={size}
                effects={effects}
                serverOffset={offsetRef.current}
                onOp={sendOp}
                onStrokeEnd={() => {
                  if (oneStroke) setStrokeSpent(true);
                }}
              />

              {/* Reactions float up over the drawing. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-2 h-0">
                {reactions.map((reaction) => (
                  <span
                    key={reaction.id}
                    className="animate-emote-pop absolute bottom-0 text-3xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
                    style={{ left: `${reaction.left}%` }}
                  >
                    {reaction.emoji}
                  </span>
                ))}
              </div>

              {isDrawer && phase === 'DRAWING' && hasDhamaka(dhamakas, 'opposite-hand') ? (
                <p className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-slate-900/85 px-3 py-1 text-xs font-bold text-amber-200">
                  🤚 Other hand! We trust you.
                </p>
              ) : null}
              {canDraw === false && isDrawer && phase === 'DRAWING' && oneStroke ? (
                <p className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-slate-900/85 px-3 py-1 text-xs font-bold text-rose-200">
                  ✍️ Your one stroke is drawn
                </p>
              ) : null}

              {toast ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <p className="animate-dhamaka-in rounded-2xl bg-emerald-400 px-5 py-3 text-2xl font-black text-emerald-950 shadow-2xl sm:text-4xl">
                    {toast}
                  </p>
                </div>
              ) : null}

              {phase === 'CHOOSING' ? (
                <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto rounded-xl bg-slate-950/95 p-2 backdrop-blur-sm sm:p-3">
                  {showReveal ? (
                    <DhamakaReveal ids={dhamakas} combo={view.round.combo} />
                  ) : isDrawer && view.round.choices ? (
                    <ChoosePanel
                      choices={view.round.choices}
                      secondsLeft={secondsLeft}
                      onChoose={(promptId) => emit('doodle:choose', { promptId })}
                    />
                  ) : (
                    <div className="text-center">
                      <p className="text-4xl" aria-hidden="true">🎨</p>
                      <p className="mt-2 text-lg font-bold text-white">{drawerName} is choosing a word…</p>
                      <div className="mt-3 flex justify-center">
                        <DhamakaChips ids={dhamakas} />
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {phase === 'ROUND_END' && view.round.result ? (
                <div className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden rounded-xl bg-slate-950/95 p-2 backdrop-blur-[2px] sm:p-3">
                  <RoundResultCard
                    result={view.round.result}
                    names={names}
                    nextDrawer={view.nextDrawerId ? (names.get(view.nextDrawerId) ?? null) : null}
                    nextCount={view.nextDhamakaCount}
                    secondsLeft={secondsLeft}
                  />
                </div>
              ) : null}
            </div>

            {isDrawer && phase === 'DRAWING' ? (
              <Toolbar
                tool={tool}
                color={ink}
                size={size}
                colors={inksFor(view)}
                sizes={brushesFor(dhamakas)}
                colorLocked={Boolean(view.round.roulette)}
                canErase={canErase}
                onTool={setTool}
                onColor={setColor}
                onSize={setSize}
                onUndo={undo}
                onClear={clearCanvas}
              />
            ) : null}
          </div>

          <div className="doodle-feed-panel flex min-h-0 flex-col rounded-xl border border-slate-800 bg-slate-950/70 p-2">
            <div className="doodle-feed-heading flex items-center justify-between border-b border-slate-800 px-1 pb-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-300">Table chat</span>
              <span className="text-[10px] text-slate-500">Guesses appear here</span>
            </div>
            <Feed entries={view.round.feed} you={playerId} />
            <GuessBar
              mode={guessMode}
              value={guess}
              lock={lock}
              lockAvailable={!(mine?.lockUsed ?? false)}
              feedback={feedback}
              onChange={setGuess}
              onToggleLock={() => setLock((value) => !value)}
              onSubmit={submitGuess}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
