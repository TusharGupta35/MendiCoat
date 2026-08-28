"use client";

import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import type { Card, GameState, MatchResult, SeatIndex, Suit, TrickPlay } from "@/types/game";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PlayingCard } from "@/components/PlayingCard";
import { ProgressToast } from "@/components/ProgressCelebration";
import {
  takeSnapshot,
  type ProgressNews,
  type ProgressSnapshot,
} from "@/lib/progress-feed";
import { useVoiceChat } from "@/components/useVoiceChat";

interface SocketRoomClientProps {
  roomCode: string;
  playerId: string;
  playerName: string;
}

type TeamId = "A" | "B";
type RoomPlayer = {
  name: string;
  isBot: boolean;
  isOnline: boolean;
  seat: number;
  team: TeamId;
} | null;

const SUIT_SYMBOL: Record<Suit, string> = {
  SPADES: "♠",
  HEARTS: "♥",
  CLUBS: "♣",
  DIAMONDS: "♦",
};

/**
 * How long a completed trick stays face-up before being swept to its winner,
 * and how long the sweep itself takes. The two together must stay under the
 * 1800ms the server waits before the next bot move (see advanceBots in
 * src/socket/server.ts), or a bot's card lands mid-presentation.
 */
const TRICK_HOLD_MS = 900;
const TRICK_SWEEP_MS = 780;

function cardLabel(card: Card) {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

export function SocketRoomClient({
  roomCode,
  playerId,
  playerName,
}: SocketRoomClientProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const voice = useVoiceChat(socket, roomCode);
  const [isConnected, setIsConnected] = useState(false);
  // Show the loading screen briefly when moving from the lobby into a game.
  const [enteringGame, setEnteringGame] = useState(false);
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([
    null,
    null,
    null,
    null,
  ]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [matchHistory, setMatchHistory] = useState<MatchResult[]>([]);
  const [seat, setSeat] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [coatTeam, setCoatTeam] = useState<TeamId | null>(null);
  const [trumpReveal, setTrumpReveal] = useState<Suit | null>(null);
  // What the finished match earned, shown at the table rather than waiting for
  // the player to wander back to the dashboard.
  const [progressNews, setProgressNews] = useState<ProgressNews | null>(null);
  // The finished trick currently being shown: face-up first so everyone can
  // read the fourth card, then swept to the winner.
  const [presentedTrick, setPresentedTrick] = useState<{
    trickNumber: number;
    cards: TrickPlay[];
    winner: SeatIndex;
    phase: "hold" | "sweep";
  } | null>(null);
  // How far each seat's card must travel to land on the winner's, measured
  // from the live layout — the grid columns are not equal widths, so this
  // cannot be derived from seat numbers alone.
  const [sweepOffsets, setSweepOffsets] = useState<Record<
    number,
    { x: number; y: number; rotation: number }
  > | null>(null);
  const [thoughtInput, setThoughtInput] = useState("");
  const [visibleThought, setVisibleThought] = useState<{
    name: string;
    message: string;
  } | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const thoughtTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveErrorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coatTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trumpTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sweepTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableCardRefs = useRef<Array<HTMLDivElement | null>>([null, null, null, null]);
  // Previous values, so we can tell a fresh cut/trick from a state we just
  // joined into — reconnecting mid-game should not replay either moment.
  const seenStateRef = useRef(false);
  const trumpSuitRef = useRef<Suit | null>(null);
  const trickNumberRef = useRef(0);
  const enteringGameTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function audio() {
    if (typeof window === "undefined") return null;
    audioContext.current ??= new AudioContext();
    // Browsers start the context suspended until a gesture; resuming on every
    // cue means the first click a player makes unlocks the rest.
    void audioContext.current.resume();
    return audioContext.current;
  }

  function tone(
    frequency: number,
    duration = 0.09,
    delay = 0,
    peak = 0.06,
    type: OscillatorType = "sine",
  ) {
    const context = audio();
    if (!context) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(peak, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  /** Named cues, so call sites read as intent instead of raw frequencies. */
  function playCue(cue: "card" | "trick" | "trump" | "coat" | "invalid" | "start" | "tap") {
    switch (cue) {
      case "card":
        // The original card beep. A quieter, noise-based "felt" version read as
        // silence on normal speakers, so this stays as it was.
        tone(280, 0.09, 0, 0.06);
        return;
      case "trick":
        // Two rising notes: someone just took the trick.
        tone(523, 0.1, 0, 0.05);
        tone(784, 0.16, 0.08, 0.05);
        return;
      case "trump":
        // A bell over a rising sweep for the cut that fixes trump.
        tone(392, 0.12, 0, 0.05);
        tone(587, 0.14, 0.1, 0.05);
        tone(880, 0.4, 0.2, 0.06, "triangle");
        return;
      case "coat":
        // Four-note fanfare for a shutout.
        [523, 659, 784, 1047].forEach((frequency, index) =>
          tone(frequency, index === 3 ? 0.5 : 0.14, index * 0.11, 0.06, "triangle"),
        );
        return;
      case "invalid":
        tone(150, 0.2, 0, 0.05, "sawtooth");
        return;
      case "start":
        tone(440, 0.12, 0, 0.05);
        tone(660, 0.18, 0.1, 0.05);
        return;
      case "tap":
        tone(440, 0.05, 0, 0.045);
    }
  }

  useEffect(() => {
    const client = io({ path: "/socket.io" });
    setSocket(client);
    setIsConnected(client.connected);
    client.on("connect", () => setIsConnected(true));
    client.on("disconnect", () => setIsConnected(false));
    client.emit("watch-room", { roomCode });
    client.emit("restore-seat", { roomCode, playerId });
    client.on("room-update", (payload: { players: RoomPlayer[] }) =>
      setRoomPlayers(payload.players),
    );
    client.on("seat-assigned", (payload: number) => setSeat(payload));
    client.on("game-started", (payload: GameState) => {
      setGameState(payload);
      playCue("start");
      setEnteringGame(true);
      if (enteringGameTimeout.current) clearTimeout(enteringGameTimeout.current);
      enteringGameTimeout.current = setTimeout(() => setEnteringGame(false), 2000);
    });
    client.on("game-state-update", (payload: GameState) => {
      setGameState((previous) => {
        if (previous && payload.trickCards.length > previous.trickCards.length)
          playCue("card");
        return payload;
      });
    });
    client.on("match-history", (payload: MatchResult[]) =>
      setMatchHistory(payload),
    );
    client.on("move-invalid", (message: string) => {
      setMoveError(message);
      playCue("invalid");
      if (moveErrorTimeout.current) clearTimeout(moveErrorTimeout.current);
      moveErrorTimeout.current = setTimeout(() => setMoveError(null), 2600);
    });
    // The server hands an abandoned room back to the lobby. Anyone still
    // watching it should land there too rather than on a dead board.
    client.on("room-reset", () => {
      setGameState(null);
      setSeat(null);
      setError(null);
      setMoveError(null);
    });
    client.on("room-full", () => setError("This room is full."));
    client.on("game-already-started", () => setError("This game has already started."));
    client.on("team-full", (team: TeamId) =>
      setError(`Team ${team} is full. Choose the other team.`),
    );
    client.on("room-thought", (payload: { name: string; message: string }) => {
      setVisibleThought(payload);
      if (thoughtTimeout.current) clearTimeout(thoughtTimeout.current);
      thoughtTimeout.current = setTimeout(() => setVisibleThought(null), 4000);
    });

    return () => {
      client.disconnect();
      audioContext.current?.close();
      audioContext.current = null;
      if (thoughtTimeout.current) clearTimeout(thoughtTimeout.current);
      if (moveErrorTimeout.current) clearTimeout(moveErrorTimeout.current);
      if (coatTimeout.current) clearTimeout(coatTimeout.current);
      if (trumpTimeout.current) clearTimeout(trumpTimeout.current);
      if (holdTimeout.current) clearTimeout(holdTimeout.current);
      if (sweepTimeout.current) clearTimeout(sweepTimeout.current);
      if (enteringGameTimeout.current) clearTimeout(enteringGameTimeout.current);
    };
  }, [roomCode]);

  // Trump is fixed by the first cut, mid-trick — the game's most dramatic beat,
  // which until now only changed a line of text. Flash it on the table instead.
  // Also chime whenever a trick is taken.
  useEffect(() => {
    if (!gameState) {
      seenStateRef.current = false;
      trumpSuitRef.current = null;
      trickNumberRef.current = 0;
      setPresentedTrick(null);
      return;
    }

    const isFirstStateSeen = !seenStateRef.current;
    const previousTrump = trumpSuitRef.current;
    const previousTrick = trickNumberRef.current;
    seenStateRef.current = true;
    trumpSuitRef.current = gameState.trumpSuit;
    trickNumberRef.current = gameState.trickNumber;
    if (isFirstStateSeen) return;

    if (gameState.trickNumber > previousTrick && gameState.lastTrick) {
      playCue("trick");
      // The server folds the fourth card straight into lastTrick, so the state
      // that reports a finished trick has already emptied trickCards. Hold the
      // four cards face-up here or nobody ever sees the card that won it.
      const { cards, winner } = gameState.lastTrick;
      setPresentedTrick({
        trickNumber: gameState.trickNumber,
        cards,
        winner,
        phase: "hold",
      });
      if (holdTimeout.current) clearTimeout(holdTimeout.current);
      if (sweepTimeout.current) clearTimeout(sweepTimeout.current);
      holdTimeout.current = setTimeout(
        () =>
          setPresentedTrick((current) =>
            current ? { ...current, phase: "sweep" } : null,
          ),
        TRICK_HOLD_MS,
      );
      sweepTimeout.current = setTimeout(
        () => setPresentedTrick(null),
        TRICK_HOLD_MS + TRICK_SWEEP_MS,
      );
    }

    if (gameState.trumpSuit && previousTrump === null) {
      setTrumpReveal(gameState.trumpSuit);
      playCue("trump");
      if (trumpTimeout.current) clearTimeout(trumpTimeout.current);
      trumpTimeout.current = setTimeout(() => setTrumpReveal(null), 2600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // A "coat" is a shutout: one team captured all four 10s. Flash it on the
  // board for a few seconds when a match ends that way.
  const finishedStatus = gameState?.status === "FINISHED" ? "FINISHED" : "LIVE";

  // The match result is written by the server as the last card lands, so the
  // snapshot is fetched a beat later and only for a real player.
  useEffect(() => {
    if (finishedStatus !== "FINISHED" || seat === null) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/me/progress");
        if (!response.ok || cancelled) return;
        const snapshot = (await response.json()) as ProgressSnapshot;
        if (cancelled) return;
        const news = takeSnapshot(snapshot);
        if (news) setProgressNews(news);
      } catch {
        // A missed celebration is not worth interrupting the table for.
      }
    }, 1200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedStatus]);

  useEffect(() => {
    if (finishedStatus !== "FINISHED" || !gameState) {
      setCoatTeam(null);
      return;
    }
    const coated = (["A", "B"] as const).find(
      (team) => gameState.capturedTens[team] === 4,
    );
    if (!coated) return;
    setCoatTeam(coated);
    playCue("coat");
    if (coatTimeout.current) clearTimeout(coatTimeout.current);
    coatTimeout.current = setTimeout(() => setCoatTeam(null), 5000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedStatus]);

  const myTeam: TeamId | null =
    seat === null ? null : seat === 0 || seat === 2 ? "A" : "B";
  const player = seat === null ? undefined : gameState?.players[seat];
  // While a finished trick is being presented it takes precedence over live
  // cards, so a fast next player cannot cut the moment short. The table view
  // lags the server by at most the hold plus the sweep.
  const collectedBy: SeatIndex | null =
    presentedTrick?.phase === "sweep" ? presentedTrick.winner : null;
  const tablePlays = presentedTrick
    ? presentedTrick.cards
    : (gameState?.trickCards ?? []);
  // Measure the trip to the winner's card. Runs after the cards are on screen,
  // so the first frame shows them at home and the sweep starts from there.
  useEffect(() => {
    if (collectedBy === null) {
      setSweepOffsets(null);
      return;
    }
    const target = tableCardRefs.current[collectedBy];
    if (!target) return;
    const targetRect = target.getBoundingClientRect();
    const offsets: Record<number, { x: number; y: number; rotation: number }> = {};
    tableCardRefs.current.forEach((element, seat) => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      offsets[seat] = {
        x: Math.round(targetRect.left - rect.left),
        y: Math.round(targetRect.top - rect.top),
        // Splay each card a little so the landed trick reads as a pile of four
        // rather than one card, since they all arrive on the same spot.
        rotation: [-9, -3, 4, 10][seat],
      };
    });
    setSweepOffsets(offsets);
  }, [collectedBy, presentedTrick?.trickNumber]);

  const openSeats = roomPlayers.filter((entry) => entry === null).length;
  const isTeamFull = (team: TeamId) =>
    (team === "A" ? [0, 2] : [1, 3]).every((teamSeat) => roomPlayers[teamSeat]);
  const historyTally = matchHistory.reduce(
    (tally, result) => {
      tally[result.winnerTeam] += 1;
      return tally;
    },
    { A: 0, B: 0, DRAW: 0 },
  );

  function joinTeam(team: TeamId) {
    setError(null);
    playCue("tap");
    socket?.emit("join-room", { roomCode, playerId, playerName, team });
  }

  function switchTeam(team: TeamId) {
    setError(null);
    playCue("tap");
    socket?.emit(
      "switch-team",
      { roomCode, team },
      (result: { error?: string }) => {
        if (result.error) setError(result.error);
      },
    );
  }

  function fillWithBots() {
    setError(null);
    socket?.emit("fill-bots", { roomCode }, (result: { error?: string }) => {
      if (result.error) setError(result.error);
    });
  }

  function startGame() {
    setError(null);
    socket?.emit("start-game", { roomCode }, (result: { error?: string }) => {
      if (result.error) setError(result.error);
    });
  }

  function playCard(card: GameState["players"][number]["cards"][number]) {
    if (seat === null || !socket) return;
    setError(null);
    setMoveError(null);
    socket.emit("play-card", { roomCode, card });
  }

  function restartGame() {
    setError(null);
    socket?.emit("restart-game", { roomCode }, (result: { error?: string }) => {
      if (result.error) setError(result.error);
    });
  }

  function sendThought(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = thoughtInput.trim();
    if (!message) return;
    setError(null);
    socket?.emit(
      "send-thought",
      { roomCode, message },
      (result: { error?: string }) => {
        if (result.error) setError(result.error);
        else setThoughtInput("");
      },
    );
  }

  if (!isConnected) {
    return <LoadingScreen message="Connecting to the room…" fullScreen={false} />;
  }

  if (enteringGame) {
    return <LoadingScreen message="Dealing the cards…" fullScreen={false} />;
  }

  return (
    <div
      className={`room-dashboard ${gameState ? "has-active-game" : "waiting-room-dashboard"} flex flex-col gap-4`}
    >
      {progressNews ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:bottom-6">
          <ProgressToast news={progressNews} onClose={() => setProgressNews(null)} />
        </div>
      ) : null}
      <div className="room-sidebar flex flex-col gap-4">
        <section className="live-room-panel rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Live room</h2>
            </div>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-500/10 px-3 py-1 text-sm text-amber-400">
              {4 - openSeats}/4
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(["A", "B"] as const).map((team) => (
              <div
                key={team}
                className="rounded-lg border border-slate-800 bg-slate-900 p-3"
              >
                <p className="team-heading text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                  Team {team} · Seats {team === "A" ? "1 & 3" : "2 & 4"}
                </p>
                <div className="mt-3 space-y-2">
                  {[team === "A" ? 0 : 1, team === "A" ? 2 : 3].map(
                    (playerSeat) => {
                      const occupant = roomPlayers[playerSeat];
                      return (
                        <div
                          key={playerSeat}
                          className="flex items-center justify-between gap-2 rounded-md bg-slate-950/70 px-3 py-2 text-sm"
                        >
                          <span className="live-seat-label text-slate-400">
                            Seat {playerSeat + 1}
                          </span>
                          <span className={`live-seat-name inline-flex items-center justify-end gap-1 ${occupant?.isBot ? "text-amber-300" : "font-medium text-white"}`}>
                            {occupant && !occupant.isBot ? <span title={occupant.isOnline ? "Online" : "Offline"} className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-slate-900 ${occupant.isOnline ? "bg-emerald-400" : "bg-slate-600"}`} /> : null}
                            {occupant ? `${occupant.name}${occupant.isBot ? " · Bot" : ""}` : "Open"}
                          </span>
                        </div>
                      );
                    },
                  )}
                </div>
                {gameState ? null : seat === null ? (
                  <button
                    type="button"
                    onClick={() => joinTeam(team)}
                    className="mt-3 w-full rounded-lg border border-amber-400/50 px-3 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-400/10"
                  >
                    Join Team {team}
                  </button>
                ) : myTeam === team ? (
                  <p className="mt-3 w-full rounded-lg border border-emerald-400/40 bg-emerald-400/5 px-3 py-2 text-center text-sm font-medium text-emerald-300">
                    Your team
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => switchTeam(team)}
                    disabled={isTeamFull(team)}
                    className="mt-3 w-full rounded-lg border border-amber-400/50 px-3 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500 disabled:hover:bg-transparent"
                  >
                    {isTeamFull(team) ? `Team ${team} is full` : `Switch to Team ${team}`}
                  </button>
                )}
              </div>
            ))}
          </div>
          {seat !== null && !gameState ? (
            openSeats === 0 ? (
              <button
                type="button"
                onClick={startGame}
                className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
              >
                Start Game
              </button>
            ) : (
              <button
                type="button"
                onClick={fillWithBots}
                className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-300"
              >
                Add {openSeats} bot{openSeats === 1 ? "" : "s"} and Start
              </button>
            )
          ) : null}
        </section>
        <section className="match-history-panel rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Match history</h2>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {matchHistory.length} played
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-900 p-2">
                <p className="text-xs uppercase tracking-wide text-amber-300">
                  Team A
                </p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {historyTally.A}
                </p>
              </div>
              <div className="rounded-lg bg-slate-900 p-2">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Draws
                </p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {historyTally.DRAW}
                </p>
              </div>
              <div className="rounded-lg bg-slate-900 p-2">
                <p className="text-xs uppercase tracking-wide text-amber-300">
                  Team B
                </p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {historyTally.B}
                </p>
              </div>
            </div>
            {matchHistory.length > 0 ? (
              <ol className="mt-3 space-y-1.5">
                {matchHistory
                  .map((result, index) => ({ result, index }))
                  .reverse()
                  .slice(0, 6)
                  .map(({ result, index }) => (
                    <li
                      key={index}
                      className="flex items-center justify-between gap-2 rounded-md bg-slate-950/70 px-3 py-1.5 text-sm"
                    >
                      <span className="text-slate-400">Match {index + 1}</span>
                      <span
                        className={`font-medium ${result.winnerTeam === "DRAW" ? "text-slate-300" : "text-amber-300"}`}
                      >
                        {result.winnerTeam === "DRAW"
                          ? "Draw"
                          : `Team ${result.winnerTeam} won`}
                      </span>
                      <span className="text-xs text-slate-500">
                        10s {result.capturedTens.A}–{result.capturedTens.B}
                      </span>
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                No matches played yet — results will appear here.
              </p>
            )}
          </section>
        {gameState ? (
          <section className="table-chat-panel rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            {visibleThought ? (
              <p className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">
                <span className="font-semibold text-amber-300">
                  {visibleThought.name}:
                </span>{" "}
                {visibleThought.message}
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-400">
                Share a quick thought with the table.
              </p>
            )}
            <form
              onSubmit={sendThought}
              className="mt-3 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1"
            >
              {seat !== null ? (
                <>
                  <button
                    type="button"
                    onClick={voice.toggleMic}
                    aria-pressed={voice.micOn}
                    title={voice.micOn ? "Mute your microphone" : "Speak to the table"}
                    className={`shrink-0 rounded-md p-1.5 transition ${
                      voice.micOn
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    {voice.micOn ? (
                      <Mic className="h-4 w-4" />
                    ) : (
                      <MicOff className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={voice.toggleSpeaker}
                    aria-pressed={voice.speakerOn}
                    title={voice.speakerOn ? "Mute other players" : "Hear other players"}
                    className={`shrink-0 rounded-md p-1.5 transition ${
                      voice.speakerOn
                        ? "bg-amber-500/20 text-amber-300"
                        : "text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    {voice.speakerOn ? (
                      <Volume2 className="h-4 w-4" />
                    ) : (
                      <VolumeX className="h-4 w-4" />
                    )}
                  </button>
                </>
              ) : null}
              <input
                value={thoughtInput}
                onChange={(event) => setThoughtInput(event.target.value)}
                maxLength={80}
                placeholder="Say something…"
                className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm text-white outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                className="shrink-0 rounded-md bg-amber-400 px-3 py-1 text-xs font-semibold text-emerald-950"
              >
                Send
              </button>
            </form>
            {voice.error ? (
              <p role="alert" className="mt-2 text-xs text-rose-300">
                {voice.error}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      {gameState ? (
        <section className="active-game-panel space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400">
              Game started
            </p>
            <div className="flex gap-4 text-sm text-slate-200">
              <p>Turn: Seat {gameState.currentTurn + 1}</p>
              <p>Trump: {gameState.trumpSuit ?? "Until first cut"}</p>
              <p>Hand: {gameState.trickNumber}</p>
            </div>
          </div>
          <div className="game-play-layout">
            <div className="game-table relative overflow-hidden rounded-2xl border-4 border-amber-950/80 bg-emerald-800 p-2 shadow-[inset_0_0_50px_rgba(0,0,0,0.35)] sm:border-8 sm:p-6">
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
                    {SUIT_SYMBOL[trumpReveal]}
                  </p>
                  <p className="animate-card-play text-xs font-black uppercase tracking-[0.3em] text-amber-300 sm:text-sm">
                    {trumpReveal} is trump
                  </p>
                </div>
              ) : null}
              {coatTeam ? (
                <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-emerald-950/60 backdrop-blur-sm">
                  <p className="animate-card-play text-6xl font-black uppercase tracking-[0.15em] text-amber-300 drop-shadow-[0_0_25px_rgba(251,191,36,0.7)] sm:text-8xl">
                    COAT
                  </p>
                  <p className="text-sm font-semibold text-amber-100 sm:text-base">
                    Team {coatTeam} swept all four 10s!
                  </p>
                </div>
              ) : null}
              <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100/75">
                {presentedTrick ? "Last completed hand" : "Current hand"}
              </p>
              <div className="game-table-grid mt-3 grid h-[380px] grid-cols-[minmax(72px,1fr)_minmax(96px,1.35fr)_minmax(72px,1fr)] grid-rows-[auto_1fr_auto] gap-1 sm:h-[510px] sm:grid-cols-[minmax(74px,1fr)_minmax(130px,2fr)_minmax(74px,1fr)] sm:gap-2">
                {[0, 1, 2, 3].map((tableSeat) => {
                  const play = tablePlays.find(
                    (entry) => entry.seat === tableSeat,
                  );
                  const participant = gameState.players[tableSeat];
                  const position = [
                    "col-start-2 row-start-3 self-end justify-self-center",
                    "col-start-1 row-start-2 self-center justify-self-start",
                    "col-start-2 row-start-1 self-start justify-self-center",
                    "col-start-3 row-start-2 self-center justify-self-end",
                  ][tableSeat];
                  return (
                    <div key={tableSeat} className={`z-10 min-w-0 ${position}`}>
                      <div
                        className={`max-w-[76px] truncate rounded-full px-1.5 py-1 text-center text-[9px] font-semibold sm:max-w-none sm:px-2 sm:text-[10px] ${gameState.currentTurn === tableSeat && gameState.status === "PLAYING" ? "bg-amber-300 text-emerald-950" : "bg-emerald-950/70 text-emerald-100"}`}
                        title={`${participant.name} · Seat ${tableSeat + 1}`}
                      >
                        {participant.name}{" "}
                        <span className="hidden sm:inline">
                          · S{tableSeat + 1}
                        </span>
                      </div>
                      {play ? (
                        <div
                          // Keyed by card, which is unique across a match, so
                          // the cards already down are not remounted (and so do
                          // not replay their entry animation) when the fourth
                          // card lands.
                          key={play.card.code}
                          ref={(element) => {
                            tableCardRefs.current[tableSeat] = element;
                          }}
                          className={`mx-auto mt-2 h-[4.5rem] w-12 sm:h-24 sm:w-16 ${
                            collectedBy === null
                              ? "animate-card-play"
                              : // Wait for the measurement, so the sweep always
                                // has a real destination to travel to.
                                sweepOffsets
                                ? "animate-trick-sweep"
                                : ""
                          }`}
                          style={
                            collectedBy === null || !sweepOffsets?.[tableSeat]
                              ? undefined
                              : ({
                                  "--sweep-x": `${sweepOffsets[tableSeat].x}px`,
                                  "--sweep-y": `${sweepOffsets[tableSeat].y}px`,
                                  "--sweep-r": `${sweepOffsets[tableSeat].rotation}deg`,
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
                  );
                })}
                <div className="col-start-2 row-start-2 hidden items-center justify-center sm:flex">
                  <div className="rounded-full border border-amber-300/30 bg-emerald-950/65 px-4 py-2 text-center text-xs text-amber-100">
                    {presentedTrick
                      ? `Seat ${presentedTrick.winner + 1} won the last hand`
                      : gameState.lastTrick && !gameState.trickCards.length
                        ? `Seat ${gameState.lastTrick.winner + 1} won the last hand`
                        : "Play a card"}
                  </div>
                </div>
              </div>
            </div>
            <div className="game-sidebar space-y-4">
              <div className="game-hand rounded-lg bg-slate-950/60 p-3 sm:p-4">
                <p className="text-sm text-slate-400">
                  Your hand {seat === null ? "" : `(Seat ${seat + 1})`}
                </p>
                <div className="mt-2 flex items-end overflow-x-auto px-4 pb-3 pt-8">
                  {player?.cards.map((card, index) => (
                    <button
                      key={card.code}
                      type="button"
                      disabled={seat !== gameState.currentTurn}
                      onClick={() => playCard(card)}
                      aria-label={cardLabel(card)}
                      className={`relative h-24 w-[4.5rem] shrink-0 rounded-lg transition hover:z-20 hover:-translate-y-5 sm:h-28 sm:w-20 disabled:cursor-not-allowed disabled:brightness-75 ${index === 0 ? "" : "-ml-2 sm:-ml-3"}`}
                    >
                      <PlayingCard
                        card={card}
                        className="h-full w-full drop-shadow-[0_8px_14px_rgba(0,0,0,0.6)]"
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className="game-scores grid gap-3 sm:grid-cols-2">
                {(["A", "B"] as const).map((team) => (
                  <div key={team} className="rounded-lg bg-slate-950/60 p-3">
                    <p className="font-medium text-white">
                      Team {team} · Seats {team === "A" ? "1 & 3" : "2 & 4"}
                    </p>
                    <p className="mt-1 text-sm text-amber-300">
                      Hands won: {gameState.handsWon[team]}
                    </p>
                    <p className="mt-1 text-sm text-amber-300">
                      Captured 10s: {gameState.capturedTens[team]}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      ♠ {gameState.capturedTensBySuit[team].SPADES} · ♥{" "}
                      {gameState.capturedTensBySuit[team].HEARTS} · ♣{" "}
                      {gameState.capturedTensBySuit[team].CLUBS} · ♦{" "}
                      {gameState.capturedTensBySuit[team].DIAMONDS}
                    </p>
                  </div>
                ))}
              </div>
              {gameState.status === "FINISHED" ? (
                <div className="rounded-lg border border-amber-400/50 bg-amber-400/10 p-4 text-center">
                  <p className="text-xl font-semibold text-white">
                    {gameState.winnerTeam === "DRAW"
                      ? "The match is a draw."
                      : `Team ${gameState.winnerTeam} wins!`}
                  </p>
                  {seat !== null && !roomPlayers[seat]?.isBot ? (
                    <button
                      type="button"
                      onClick={restartGame}
                      className="mt-3 rounded-lg bg-amber-400 px-4 py-2 font-medium text-amber-950"
                    >
                      Play again
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
