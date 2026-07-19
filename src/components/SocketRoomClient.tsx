"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { Card, GameState, Suit } from "@/types/game";

interface SocketRoomClientProps {
  roomCode: string;
  playerName: string;
  allowBots: boolean;
}

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
  playerName,
  allowBots,
}: SocketRoomClientProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomPlayers, setRoomPlayers] = useState<string[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [seat, setSeat] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = io({ path: "/socket.io" });
    setSocket(client);

    client.emit("join-room", { roomCode, playerName });
    client.on("room-update", (payload) => setRoomPlayers(payload.players));
    client.on("seat-assigned", (payload) => setSeat(payload));
    client.on("game-started", (payload) => setGameState(payload));
    client.on("game-state-update", (payload) => setGameState(payload));
    client.on("move-invalid", (message) => setError(message));
    client.on("room-full", () => setError("This room is full."));

    return () => {
      client.disconnect();
    };
  }, [roomCode, playerName]);

  const player = seat === null ? undefined : gameState?.players[seat];
  const tablePlays = gameState?.trickCards.length
    ? gameState.trickCards
    : (gameState?.lastTrick?.cards ?? []);

  function fillWithBots() {
    socket?.emit("fill-bots", { roomCode }, (result: { error?: string }) => {
      if (result.error) setError(result.error);
    });
  }

  function playCard(card: GameState["players"][number]["cards"][number]) {
    if (seat === null || !socket) return;
    setError(null);
    socket.emit("play-card", { roomCode, seat, card });
  }

  function restartGame() {
    setError(null);
    socket?.emit("restart-game", { roomCode }, (result: { error?: string }) => {
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <h2 className="text-lg font-semibold text-white">Live room</h2>
        <p className="mt-1 text-sm text-slate-400">
          Players joined: {roomPlayers.length} / 4
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {roomPlayers.map((name, index) => (
            <div
              key={`${name}-${index}`}
              className="rounded-lg border border-slate-800 bg-slate-900 p-3"
            >
              <p className="text-sm text-slate-400">Seat {index + 1}</p>
              <p className="mt-1 font-medium text-white">{name}</p>
            </div>
          ))}
        </div>
      </div>

      {gameState ? (
        <div className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-400">
            Game started
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-slate-200">
            <p>Current turn: Seat {gameState.currentTurn + 1}</p>
            <p>Trump: {gameState.trumpSuit}</p>
            <p>Trick: {gameState.trickNumber}</p>
          </div>
          <div className="overflow-hidden rounded-2xl border-8 border-amber-950/80 bg-emerald-800 p-3 shadow-[inset_0_0_50px_rgba(0,0,0,0.35)] sm:p-6">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100/75">
              {gameState.trickCards.length
                ? "Current trick"
                : "Last completed trick"}
            </p>
            <div className="mt-3 grid min-h-[340px] grid-cols-[minmax(74px,1fr)_minmax(130px,2fr)_minmax(74px,1fr)] grid-rows-[auto_1fr_auto] gap-2 sm:min-h-[410px]">
              {[0, 1, 2, 3].map((tableSeat) => {
                const play = tablePlays.find(
                  (entry) => entry.seat === tableSeat,
                );
                const participant = gameState.players[tableSeat];
                const position = [
                  "col-start-2 row-start-3 self-end justify-self-center", // Seat 1 (You)
                  "col-start-1 row-start-2 self-center justify-self-start", // Seat 2 (Left)
                  "col-start-2 row-start-1 self-start justify-self-center", // Seat 3 (Partner/Top)
                  "col-start-3 row-start-2 self-center justify-self-end", // Seat 4 (Right)
                ][tableSeat];
                return (
                  <div key={tableSeat} className={`z-10 ${position}`}>
                    <div
                      className={`rounded-full px-2 py-1 text-center text-[10px] font-semibold ${gameState.currentTurn === tableSeat && gameState.status === "PLAYING" ? "bg-amber-300 text-emerald-950" : "bg-emerald-950/70 text-emerald-100"}`}
                    >
                      {participant.name} · S{tableSeat + 1}
                    </div>
                    {play ? (
                      <div
                        key={play.card.code}
                        className={`animate-card-play mx-auto mt-2 flex h-20 w-14 flex-col justify-between rounded-md bg-stone-50 p-1.5 shadow-lg ${suitColor(play.card.suit)}`}
                      >
                        <span className="text-sm font-bold leading-none">
                          {cardLabel(play.card)}
                        </span>
                        <span className="self-center text-2xl leading-none">
                          {SUIT_SYMBOL[play.card.suit]}
                        </span>
                        <span className="self-end rotate-180 text-sm font-bold leading-none">
                          {cardLabel(play.card)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div className="col-start-2 row-start-2 flex items-center justify-center">
                <div className="rounded-full border border-amber-300/30 bg-emerald-950/65 px-4 py-2 text-center text-xs text-amber-100">
                  {gameState.lastTrick && !gameState.trickCards.length
                    ? `Seat ${gameState.lastTrick.winner + 1} won the last trick`
                    : "Play a card"}
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["A", "B"] as const).map((team) => (
              <div key={team} className="rounded-lg bg-slate-950/60 p-3">
                <p className="font-medium text-white">
                  Team {team} · Seats {team === "A" ? "1 & 3" : "2 & 4"}
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
              <p className="text-sm uppercase tracking-[0.2em] text-amber-300">
                Match complete
              </p>
              <p className="mt-1 text-xl font-semibold text-white">
                {gameState.winnerTeam === "DRAW"
                  ? "The match is a draw."
                  : `Team ${gameState.winnerTeam} wins!`}
              </p>
              {seat === 0 ? (
                <button
                  type="button"
                  onClick={restartGame}
                  className="mt-3 rounded-lg bg-amber-400 px-4 py-2 font-medium text-amber-950 transition hover:bg-amber-300"
                >
                  Play again in this room
                </button>
              ) : (
                <p className="mt-2 text-sm text-slate-300">
                  Seat 1 can start the next game in this room.
                </p>
              )}
            </div>
          ) : null}
          <div className="rounded-lg bg-slate-950/60 p-3">
            <p className="text-sm text-slate-400">
              Your hand {seat === null ? "" : `(Seat ${seat + 1})`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {player?.cards.map((card) => (
                <button
                  key={card.code}
                  type="button"
                  disabled={seat !== gameState.currentTurn}
                  onClick={() => playCard(card)}
                  className={`rounded border bg-stone-50 px-3 py-2 font-mono text-sm font-bold shadow transition hover:-translate-y-1 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-45 ${suitColor(card.suit)} border-stone-300`}
                >
                  {cardLabel(card)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">
          <p>Waiting for more players to join.</p>
          {allowBots ? (
            <button
              type="button"
              onClick={fillWithBots}
              className="mt-3 rounded-lg border border-amber-400/50 px-3 py-2 font-medium text-amber-300 transition hover:bg-amber-400/10"
            >
              Fill with 3 test bots
            </button>
          ) : null}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
