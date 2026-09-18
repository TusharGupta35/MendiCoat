'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useVoiceChat } from '@/components/useVoiceChat';
import { FINAL_DEFENCE_MS, SUDDEN_DEATH_DISCUSS_MS, timingsFor } from './engine';
import { ImpostorLobby, type ImpostorRoomPayload } from './Lobby';
import {
  AnswerBoard,
  AnswerInput,
  ChaalBanner,
  Countdown,
  DefencePanel,
  FinalResults,
  FloatingReactions,
  QuestionCard,
  ReactionBar,
  RevealPanel,
  RoleCard,
  RoundResultCard,
  Scoreboard,
  StealPanel,
  SuspicionRow,
  Toast,
  VotePanel,
  type Person,
} from './Panels';
import type { ImpostorView, Mode } from './types';

/**
 * An Impostor table.
 *
 * The rule that governs this file: it never decides who may see what. The
 * server sends each player a view already stripped to what they are allowed to
 * know, and this draws it. There is no secret sitting in this component waiting
 * to be found in devtools — an impostor's page simply never receives the
 * question.
 *
 * The layout is three named areas — stage, scores, social — arranged by
 * `.impostor-shell` in globals.css rather than by breakpoint classes here, so
 * the phone and the desktop are one description of the same table instead of
 * two component trees that have to be kept in step.
 */

interface ImpostorRoomClientProps {
  roomCode: string;
  playerId: string;
  playerName: string;
  playerAvatar: string | null;
  playerTitle: string | null;
}

/** Phases where what you must do next belongs against the bottom of a phone. */
const ACTIONABLE = new Set(['ANSWER', 'DISCUSS', 'VOTE', 'STEAL']);

export function ImpostorRoomClient({
  roomCode,
  playerId,
  playerName,
  playerAvatar,
  playerTitle,
}: ImpostorRoomClientProps) {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<ImpostorRoomPayload | null>(null);
  const [view, setView] = useState<ImpostorView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Array<{ id: number; emoji: string; left: number }>>([]);

  // Server time, as best this browser can tell. Every countdown reads this
  // rather than Date.now(), so a phone with a wandering clock still sees the
  // same seconds remaining as everybody else.
  const offsetRef = useRef(0);
  const [clock, setClock] = useState(() => Date.now());

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
      client.emit('imp:watch', { roomCode });
      client.emit('imp:join', { roomCode, playerId, playerName, playerAvatar, playerTitle });
    };
    client.on('connect', hello);
    client.on('disconnect', () => setConnected(false));
    if (client.connected) hello();

    client.on('imp:room', (payload: ImpostorRoomPayload) => setRoom(payload));
    client.on('imp:state', (payload: ImpostorView | null) => {
      if (payload) offsetRef.current = payload.serverNow - Date.now();
      setView(payload);
    });
    client.on('imp:error', (message: string) => flash(message));
    client.on('imp:closed', () => {
      flash('The host closed this room.');
      router.replace('/games/impostor');
    });
    client.on('imp:reacted', ({ emoji }: { playerId: string; emoji: string }) => {
      const id = Date.now() + Math.random();
      setReactions((current) => [...current, { id, emoji, left: 10 + Math.random() * 80 }]);
      later(() => setReactions((current) => current.filter((entry) => entry.id !== id)), 2_200);
    });

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      client.close();
    };
  }, [roomCode, playerId, playerName, playerAvatar, playerTitle, flash, later, router]);

  // The countdowns move between server updates, which only arrive when
  // something has actually changed.
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now() + offsetRef.current), 250);
    return () => clearInterval(id);
  }, []);

  // ── Talking to the server ─────────────────────────────────────────────────
  type Reply = { error?: string };
  const send = useCallback(
    (event: string, payload: Record<string, unknown>, done?: () => void) => {
      socket?.emit(event, { roomCode, ...payload }, (reply: Reply | undefined) => {
        if (reply?.error) flash(reply.error);
        else done?.();
      });
    },
    [socket, roomCode, flash],
  );

  /**
   * A reaction expects no answer, so it is emitted straight rather than through
   * `send` — `send` always attaches an acknowledgement callback, and the server
   * never calls one back for this event, which would strand one per emoji in
   * socket.io-client's pending-ack map for the life of the page.
   */
  const react = useCallback(
    (emoji: string) => {
      socket?.emit('imp:react', { roomCode, emoji });
    },
    [socket, roomCode],
  );

  const people: Person[] = useMemo(
    () => (room?.players ?? []).map((player) => ({ id: player.id, name: player.name, avatar: player.avatar })),
    [room],
  );

  if (!room) return <LoadingScreen message="Finding the table…" />;

  const isAdmin = room.admin?.id === playerId;

  // ── The lobby ─────────────────────────────────────────────────────────────
  if (!view) {
    return (
      <>
        <Toast text={notice} />
        <ImpostorLobby
          room={room}
          playerId={playerId}
          onAddQuestion={(text, done) => send('imp:add-question', { text }, done)}
          onRemoveQuestion={(text) => send('imp:remove-question', { text })}
          onMode={(mode: Mode) => send('imp:mode', { mode })}
          onStart={() => send('imp:start', {})}
        />
      </>
    );
  }

  // ── The table ─────────────────────────────────────────────────────────────
  const { round, phase } = view;
  const times = timingsFor(view.mode);
  const yourTurn = round.answeringId === view.you;
  const remaining = Math.max(0, round.endsAt - clock);
  const finalDefence = phase === 'DISCUSS' && remaining <= FINAL_DEFENCE_MS;

  /** How long this phase was given, so the bar knows how full to start. */
  const phaseLength = () => {
    switch (phase) {
      case 'ROLE':
        return times.role;
      case 'ANSWER':
        return times.answer;
      case 'DISCUSS':
        return round.suddenDeath ? SUDDEN_DEATH_DISCUSS_MS : times.discuss;
      case 'DEFENCE':
        return times.defence;
      case 'VOTE':
        return times.vote;
      case 'REVEAL':
        return times.reveal;
      case 'STEAL':
        return times.steal;
      default:
        return times.result;
    }
  };

  /** What the clock is counting down to, said plainly. */
  const phaseNote = () => {
    switch (phase) {
      case 'ROLE':
        return 'Starting';
      case 'ANSWER':
        return yourTurn ? 'Your turn' : 'Answering';
      case 'DISCUSS':
        return finalDefence ? 'Final defence' : 'Discuss';
      case 'DEFENCE':
        return 'Safai';
      case 'VOTE':
        return 'Vote';
      case 'STEAL':
        return 'Steal';
      default:
        return undefined;
    }
  };

  /**
   * The evidence: what everybody has said so far.
   *
   * Present from the first answer right through to the vote, because every
   * phase after the answers is spent arguing about them and nobody should have
   * to remember what was said.
   */
  const evidence = <AnswerBoard view={view} people={people} />;

  /** What you must do now. On a phone this rides the bottom of the screen. */
  const action = () => {
    switch (phase) {
      case 'ANSWER':
        return yourTurn ? (
          <AnswerInput
            format={round.format}
            people={people}
            order={round.order}
            you={view.you}
            oneWord={round.chaal === 'ek-lafaz'}
            onAnswer={(text) => send('imp:answer', { text })}
          />
        ) : (
          <p className="text-center text-sm text-slate-500">
            {round.answeringId ? 'Waiting on them…' : 'Everybody has answered.'}
          </p>
        );

      case 'DISCUSS':
        return <SuspicionRow view={view} people={people} onSuspect={(id) => send('imp:suspect', { targetId: id })} />;

      case 'VOTE':
        return <VotePanel view={view} people={people} onVote={(id) => send('imp:vote', { targetId: id })} />;

      case 'STEAL':
        return <StealPanel view={view} people={people} onSteal={(id) => send('imp:steal', { questionId: id })} />;

      default:
        return null;
    }
  };

  const stage = () => {
    switch (phase) {
      case 'ROLE':
        return <RoleCard view={view} />;

      case 'ANSWER':
      case 'DISCUSS':
      case 'VOTE':
        return (
          <>
            {/* Once the arguing starts the question shrinks: by then everybody
                has read it, and the answers are what people are looking at. */}
            <QuestionCard view={view} compact={phase !== 'ANSWER'} />
            {evidence}
            <ReactionBar onReact={react} />
          </>
        );

      case 'DEFENCE':
        return (
          <>
            <DefencePanel view={view} people={people} />
            {evidence}
            <ReactionBar onReact={react} />
          </>
        );

      case 'REVEAL':
        return <RevealPanel view={view} people={people} />;

      case 'STEAL':
        return <RevealPanel view={view} people={people} />;

      case 'ROUND_END':
        return round.result ? <RoundResultCard result={round.result} people={people} /> : null;

      case 'GAME_OVER':
        return <FinalResults view={view} people={people} isAdmin={isAdmin} onReset={() => send('imp:reset', {})} />;

      default:
        return null;
    }
  };

  const nowActing = ACTIONABLE.has(phase);

  return (
    <>
      <Toast text={notice} />
      <FloatingReactions reactions={reactions} />

      <div className="impostor-shell">
        <div className="impostor-stage">
          {phase !== 'GAME_OVER' ? (
            <div className="flex flex-col gap-2">
              <ChaalBanner view={view} />
              <Countdown
                endsAt={round.endsAt}
                now={clock}
                total={phaseLength()}
                urgent={finalDefence || phase === 'VOTE'}
                note={phaseNote()}
              />
            </div>
          ) : null}

          {stage()}

          {nowActing ? <div className="impostor-action">{action()}</div> : null}
        </div>

        <Scoreboard view={view} people={people} />

        <section className="impostor-social rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <h2 className="impostor-voice-label text-sm font-semibold text-white">Table talk</h2>
          <p className="impostor-voice-label mt-1 text-[11px] text-slate-500">
            The arguing is the game. Turn your mic on.
          </p>
          <div className="flex gap-2 lg:mt-3">
            <button
              type="button"
              onClick={voice.toggleMic}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition active:scale-[0.98] ${
                voice.micOn ? 'bg-emerald-400/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {voice.micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              {voice.micOn ? 'Mic on' : 'Mic off'}
            </button>
            <button
              type="button"
              onClick={voice.toggleSpeaker}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition active:scale-[0.98] ${
                voice.speakerOn ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {voice.speakerOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {voice.speakerOn ? 'Hearing' : 'Muted'}
            </button>
          </div>

          {!connected ? (
            <p className="mt-3 rounded-xl border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-center text-xs text-amber-200">
              Reconnecting…
            </p>
          ) : null}

          {isAdmin && phase !== 'GAME_OVER' ? (
            <button
              type="button"
              onClick={() => send('imp:reset', {})}
              className="mt-3 w-full rounded-xl border border-slate-800 px-3 py-2 text-xs text-slate-500 transition hover:border-slate-700 hover:text-slate-300"
            >
              Abandon this game
            </button>
          ) : null}
        </section>
      </div>
    </>
  );
}
