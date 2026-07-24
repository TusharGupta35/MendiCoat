"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import type { Card, GameState, MatchResult, Suit } from "@/types/game";
import { LoadingScreen } from "@/components/LoadingScreen";
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

function cardLabel(card: Card) {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

function suitColor(suit: Suit) {
  return suit === "HEARTS" || suit === "DIAMONDS"
    ? "text-rose-600"
    : "text-slate-900";
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
  const [thoughtInput, setThoughtInput] = useState("");
  const [visibleThought, setVisibleThought] = useState<{
    name: string;
    message: string;
  } | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const thoughtTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveErrorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coatTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enteringGameTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function playSound(frequency: number, duration = 0.09) {
    if (typeof window === "undefined") return;
    audioContext.current ??= new AudioContext();
    const context = audioContext.current;
    void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + duration,
    );
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
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
      playSound(600, 0.16);
      setEnteringGame(true);
      if (enteringGameTimeout.current) clearTimeout(enteringGameTimeout.current);
      enteringGameTimeout.current = setTimeout(() => setEnteringGame(false), 2000);
    });
    client.on("game-state-update", (payload: GameState) => {
      setGameState((previous) => {
        if (previous && payload.trickCards.length > previous.trickCards.length)
          playSound(280);
        return payload;
      });
    });
    client.on("match-history", (payload: MatchResult[]) =>
      setMatchHistory(payload),
    );
    client.on("move-invalid", (message: string) => {
      setMoveError(message);
      playSound(180, 0.18);
      if (moveErrorTimeout.current) clearTimeout(moveErrorTimeout.current);
      moveErrorTimeout.current = setTimeout(() => setMoveError(null), 2600);
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
      if (enteringGameTimeout.current) clearTimeout(enteringGameTimeout.current);
    };
  }, [roomCode]);

  // A "coat" is a shutout: one team captured all four 10s. Flash it on the
  // board for a few seconds when a match ends that way.
  const finishedStatus = gameState?.status === "FINISHED" ? "FINISHED" : "LIVE";
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
    playSound(720, 0.3);
    if (coatTimeout.current) clearTimeout(coatTimeout.current);
    coatTimeout.current = setTimeout(() => setCoatTeam(null), 5000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedStatus]);

  const player = seat === null ? undefined : gameState?.players[seat];
  const tablePlays = gameState?.trickCards.length
    ? gameState.trickCards
    : (gameState?.lastTrick?.cards ?? []);
  const openSeats = roomPlayers.filter((entry) => entry === null).length;
  const historyTally = matchHistory.reduce(
    (tally, result) => {
      tally[result.winnerTeam] += 1;
      return tally;
    },
    { A: 0, B: 0, DRAW: 0 },
  );

  function joinTeam(team: TeamId) {
    setError(null);
    playSound(440, 0.05);
    socket?.emit("join-room", { roomCode, playerId, playerName, team });
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
                {seat === null && !gameState ? (
                  <button
                    type="button"
                    onClick={() => joinTeam(team)}
                    className="mt-3 w-full rounded-lg border border-amber-400/50 px-3 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-400/10"
                  >
                    Join Team {team}
                  </button>
                ) : null}
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
              <p>Trump: {gameState.trumpSuit ?? "After Hand 1"}</p>
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
              {coatTeam ? (
                <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-emerald-950/60 backdrop-blur-sm">
                  <p className="animate-card-play text-6xl font-black uppercase tracking-[0.15em] text-amber-300 drop-shadow-[0_0_25px_rgba(251,191,36,0.7)] sm:text-8xl">
                    COAT
                  </p>
                  <p className="text-sm font-semibold text-amber-100 sm:text-base">
                    Team {coatTeam === "A" ? "B" : "A"} got all four 10s taken!
                  </p>
                </div>
              ) : null}
              <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100/75">
                {gameState.trickCards.length
                  ? "Current hand"
                  : "Last completed hand"}
              </p>
              <div className="game-table-grid mt-3 grid min-h-[280px] grid-cols-[minmax(72px,1fr)_minmax(96px,1.35fr)_minmax(72px,1fr)] grid-rows-[auto_1fr_auto] gap-1 sm:min-h-[410px] sm:grid-cols-[minmax(74px,1fr)_minmax(130px,2fr)_minmax(74px,1fr)] sm:gap-2">
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
                          className={`animate-card-play mx-auto mt-2 flex h-[4.5rem] w-12 flex-col justify-between rounded-md bg-stone-50 p-1 shadow-lg sm:h-24 sm:w-16 sm:p-1.5 ${suitColor(play.card.suit)}`}
                        >
                          <span className="text-xs font-bold sm:text-sm">
                            {cardLabel(play.card)}
                          </span>
                          <span className="self-center text-xl sm:text-2xl">
                            {SUIT_SYMBOL[play.card.suit]}
                          </span>
                          <span className="self-end rotate-180 text-xs font-bold sm:text-sm">
                            {cardLabel(play.card)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <div className="col-start-2 row-start-2 hidden items-center justify-center sm:flex">
                  <div className="rounded-full border border-amber-300/30 bg-emerald-950/65 px-4 py-2 text-center text-xs text-amber-100">
                    {gameState.lastTrick && !gameState.trickCards.length
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
                      className={`relative flex h-24 w-[4.5rem] shrink-0 flex-col items-start overflow-hidden rounded-lg border-2 border-stone-300 bg-stone-50 p-2.5 font-mono text-sm font-bold shadow-md transition hover:z-20 hover:-translate-y-5 hover:shadow-xl sm:h-28 sm:w-20 sm:text-base disabled:cursor-not-allowed disabled:brightness-75 ${index === 0 ? "" : "-ml-2 sm:-ml-3"} ${suitColor(card.suit)}`}
                    >
                      <span className="leading-none">{cardLabel(card)}</span>
                      <span className="mt-3 text-3xl leading-none sm:text-4xl">
                        {SUIT_SYMBOL[card.suit]}
                      </span>
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
