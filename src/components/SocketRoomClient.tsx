"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { Card, GameState, Suit } from "@/types/game";

interface SocketRoomClientProps {
  roomCode: string;
  playerId: string;
  playerName: string;
}

type TeamId = "A" | "B";
type RoomPlayer = { name: string; isBot: boolean; seat: number; team: TeamId } | null;

const SUIT_SYMBOL: Record<Suit, string> = { SPADES: "♠", HEARTS: "♥", CLUBS: "♣", DIAMONDS: "♦" };

function cardLabel(card: Card) {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

function suitColor(suit: Suit) {
  return suit === "HEARTS" || suit === "DIAMONDS" ? "text-rose-600" : "text-slate-900";
}

export function SocketRoomClient({ roomCode, playerId, playerName }: SocketRoomClientProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([null, null, null, null]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [seat, setSeat] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thoughtInput, setThoughtInput] = useState("");
  const [visibleThought, setVisibleThought] = useState<{ name: string; message: string } | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const thoughtTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function playSound(frequency: number, duration = 0.09) {
    if (typeof window === "undefined") return;
    audioContext.current ??= new AudioContext();
    const context = audioContext.current;
    void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }

  useEffect(() => {
    const client = io({ path: "/socket.io" });
    setSocket(client);
    client.emit("watch-room", { roomCode });
    client.emit("restore-seat", { roomCode, playerId });
    client.on("room-update", (payload: { players: RoomPlayer[] }) => setRoomPlayers(payload.players));
    client.on("seat-assigned", (payload: number) => setSeat(payload));
    client.on("game-started", (payload: GameState) => {
      setGameState(payload);
      playSound(600, 0.16);
    });
    client.on("game-state-update", (payload: GameState) => {
      setGameState((previous) => {
        if (previous && payload.trickCards.length > previous.trickCards.length) playSound(280);
        return payload;
      });
    });
    client.on("move-invalid", (message: string) => setError(message));
    client.on("room-full", () => setError("This room is full."));
    client.on("team-full", (team: TeamId) => setError(`Team ${team} is full. Choose the other team.`));
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
    };
  }, [roomCode]);

  const player = seat === null ? undefined : gameState?.players[seat];
  const tablePlays = gameState?.trickCards.length ? gameState.trickCards : (gameState?.lastTrick?.cards ?? []);
  const openSeats = roomPlayers.filter((entry) => entry === null).length;

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

  function playCard(card: GameState["players"][number]["cards"][number]) {
    if (seat === null || !socket) return;
    setError(null);
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
    socket?.emit("send-thought", { roomCode, message }, (result: { error?: string }) => {
      if (result.error) setError(result.error);
      else setThoughtInput("");
    });
  }

  return (
    <div className={`room-dashboard ${gameState ? "has-active-game" : "waiting-room-dashboard"} flex flex-col gap-4`}>
      <div className="room-sidebar flex flex-col gap-4">
      <section className="live-room-panel rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Live room</h2>
            <p className="mt-1 text-sm text-slate-400">Choose a team, then fill only the remaining seats with bots if needed.</p>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-500/10 px-3 py-1 text-sm text-amber-400">{4 - openSeats}/4</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(["A", "B"] as const).map((team) => (
            <div key={team} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
              <p className="team-heading text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Team {team} · Seats {team === "A" ? "1 & 3" : "2 & 4"}</p>
              <div className="mt-3 space-y-2">
                {([team === "A" ? 0 : 1, team === "A" ? 2 : 3]).map((playerSeat) => {
                  const occupant = roomPlayers[playerSeat];
                  return <div key={playerSeat} className="flex items-center justify-between gap-2 rounded-md bg-slate-950/70 px-3 py-2 text-sm">
                    <span className="live-seat-label text-slate-400">Seat {playerSeat + 1}</span>
                    <span className={`live-seat-name ${occupant?.isBot ? "text-amber-300" : "font-medium text-white"}`}>{occupant ? `${occupant.name}${occupant.isBot ? " · Bot" : ""}` : "Open"}</span>
                  </div>;
                })}
              </div>
              {seat === null && !gameState ? <button type="button" onClick={() => joinTeam(team)} className="mt-3 w-full rounded-lg border border-amber-400/50 px-3 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-400/10">Join Team {team}</button> : null}
            </div>
          ))}
        </div>
        {seat !== null && !gameState && openSeats > 0 ? <button type="button" onClick={fillWithBots} className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-300">Add {openSeats} bot{openSeats === 1 ? "" : "s"} and start</button> : null}
      </section>
      {gameState ? <section className="table-chat-panel rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        
        {visibleThought ? <p className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"><span className="font-semibold text-amber-300">{visibleThought.name}:</span> {visibleThought.message}</p> : <p className="mt-2 text-sm text-slate-400">Share a quick thought with the table.</p>}
        <form onSubmit={sendThought} className="mt-3 flex rounded-lg border border-slate-700 bg-slate-900 p-1">
          <input value={thoughtInput} onChange={(event) => setThoughtInput(event.target.value)} maxLength={80} placeholder="Say something…" className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm text-white outline-none placeholder:text-slate-400" />
          <button type="submit" className="rounded-md bg-amber-400 px-3 py-1 text-xs font-semibold text-emerald-950">Send</button>
        </form>
      </section> : null}
      </div>

      {gameState ? <section className="active-game-panel space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Game started</p>
          <div className="flex gap-4 text-sm text-slate-200"><p>Turn: Seat {gameState.currentTurn + 1}</p><p>Trump: {gameState.trumpSuit}</p><p>Hand: {gameState.trickNumber}</p></div>
        </div>
        <div className="game-play-layout">
        <div className="game-table overflow-hidden rounded-2xl border-4 border-amber-950/80 bg-emerald-800 p-2 shadow-[inset_0_0_50px_rgba(0,0,0,0.35)] sm:border-8 sm:p-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100/75">{gameState.trickCards.length ? "Current hand" : "Last completed hand"}</p>
          <div className="game-table-grid mt-3 grid min-h-[280px] grid-cols-[minmax(72px,1fr)_minmax(96px,1.35fr)_minmax(72px,1fr)] grid-rows-[auto_1fr_auto] gap-1 sm:min-h-[410px] sm:grid-cols-[minmax(74px,1fr)_minmax(130px,2fr)_minmax(74px,1fr)] sm:gap-2">
            {[0, 1, 2, 3].map((tableSeat) => {
              const play = tablePlays.find((entry) => entry.seat === tableSeat);
              const participant = gameState.players[tableSeat];
              const position = ["col-start-2 row-start-3 self-end justify-self-center", "col-start-1 row-start-2 self-center justify-self-start", "col-start-2 row-start-1 self-start justify-self-center", "col-start-3 row-start-2 self-center justify-self-end"][tableSeat];
              return <div key={tableSeat} className={`z-10 min-w-0 ${position}`}><div className={`max-w-[76px] truncate rounded-full px-1.5 py-1 text-center text-[9px] font-semibold sm:max-w-none sm:px-2 sm:text-[10px] ${gameState.currentTurn === tableSeat && gameState.status === "PLAYING" ? "bg-amber-300 text-emerald-950" : "bg-emerald-950/70 text-emerald-100"}`} title={`${participant.name} · Seat ${tableSeat + 1}`}>{participant.name} <span className="hidden sm:inline">· S{tableSeat + 1}</span></div>{play ? <div className={`animate-card-play mx-auto mt-2 flex h-[4.5rem] w-12 flex-col justify-between rounded-md bg-stone-50 p-1 shadow-lg sm:h-24 sm:w-16 sm:p-1.5 ${suitColor(play.card.suit)}`}><span className="text-xs font-bold sm:text-sm">{cardLabel(play.card)}</span><span className="self-center text-xl sm:text-2xl">{SUIT_SYMBOL[play.card.suit]}</span><span className="self-end rotate-180 text-xs font-bold sm:text-sm">{cardLabel(play.card)}</span></div> : null}</div>;
            })}
            <div className="col-start-2 row-start-2 hidden items-center justify-center sm:flex"><div className="rounded-full border border-amber-300/30 bg-emerald-950/65 px-4 py-2 text-center text-xs text-amber-100">{gameState.lastTrick && !gameState.trickCards.length ? `Seat ${gameState.lastTrick.winner + 1} won the last hand` : "Play a card"}</div></div>
          </div>
        </div>
        <div className="game-sidebar space-y-4">
        <div className="game-hand rounded-lg bg-slate-950/60 p-3 sm:p-4"><p className="text-sm text-slate-400">Your hand {seat === null ? "" : `(Seat ${seat + 1})`}</p><div className="mt-2 flex items-end overflow-x-auto px-4 pb-3 pt-8">{player?.cards.map((card, index) => <button key={card.code} type="button" disabled={seat !== gameState.currentTurn} onClick={() => playCard(card)} className={`relative flex h-24 w-[4.5rem] shrink-0 flex-col items-start overflow-hidden rounded-lg border-2 border-stone-300 bg-stone-50 p-2.5 font-mono text-sm font-bold shadow-md transition hover:z-20 hover:-translate-y-5 hover:shadow-xl sm:h-28 sm:w-20 sm:text-base disabled:cursor-not-allowed disabled:brightness-75 ${index === 0 ? "" : "-ml-2 sm:-ml-3"} ${suitColor(card.suit)}`}><span className="leading-none">{cardLabel(card)}</span><span className="mt-3 text-3xl leading-none sm:text-4xl">{SUIT_SYMBOL[card.suit]}</span></button>)}</div></div>
        <div className="game-scores grid gap-3 sm:grid-cols-2">{(["A", "B"] as const).map((team) => <div key={team} className="rounded-lg bg-slate-950/60 p-3"><p className="font-medium text-white">Team {team} · Seats {team === "A" ? "1 & 3" : "2 & 4"}</p><p className="mt-1 text-sm text-amber-300">Hands won: {gameState.handsWon[team]}</p><p className="mt-1 text-sm text-amber-300">Captured 10s: {gameState.capturedTens[team]}</p><p className="mt-1 text-xs text-slate-400">♠ {gameState.capturedTensBySuit[team].SPADES} · ♥ {gameState.capturedTensBySuit[team].HEARTS} · ♣ {gameState.capturedTensBySuit[team].CLUBS} · ♦ {gameState.capturedTensBySuit[team].DIAMONDS}</p></div>)}</div>
        {gameState.status === "FINISHED" ? <div className="rounded-lg border border-amber-400/50 bg-amber-400/10 p-4 text-center"><p className="text-xl font-semibold text-white">{gameState.winnerTeam === "DRAW" ? "The match is a draw." : `Team ${gameState.winnerTeam} wins!`}</p>{seat !== null && !roomPlayers[seat]?.isBot ? <button type="button" onClick={restartGame} className="mt-3 rounded-lg bg-amber-400 px-4 py-2 font-medium text-amber-950">Play again</button> : null}</div> : null}
        </div>
        </div>
      </section> : null}
      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
