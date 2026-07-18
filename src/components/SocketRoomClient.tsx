'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState } from '@/types/game';

interface SocketRoomClientProps {
  roomCode: string;
  playerName: string;
  allowBots: boolean;
}

export function SocketRoomClient({ roomCode, playerName, allowBots }: SocketRoomClientProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomPlayers, setRoomPlayers] = useState<string[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [seat, setSeat] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = io({ path: '/socket.io' });
    setSocket(client);

    client.emit('join-room', { roomCode, playerName });
    client.on('room-update', (payload) => setRoomPlayers(payload.players));
    client.on('seat-assigned', (payload) => setSeat(payload));
    client.on('game-started', (payload) => setGameState(payload));
    client.on('game-state-update', (payload) => setGameState(payload));
    client.on('move-invalid', (message) => setError(message));
    client.on('room-full', () => setError('This room is full.'));

    return () => {
      client.disconnect();
    };
  }, [roomCode, playerName]);

  const player = seat === null ? undefined : gameState?.players[seat];

  function fillWithBots() {
    socket?.emit('fill-bots', { roomCode }, (result: { error?: string }) => {
      if (result.error) setError(result.error);
    });
  }

  function playCard(card: GameState['players'][number]['cards'][number]) {
    if (seat === null || !socket) return;
    setError(null);
    socket.emit('play-card', { roomCode, seat, card });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <h2 className="text-lg font-semibold text-white">Live room</h2>
        <p className="mt-1 text-sm text-slate-400">Players joined: {roomPlayers.length} / 4</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {roomPlayers.map((name, index) => (
            <div key={`${name}-${index}`} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
              <p className="text-sm text-slate-400">Seat {index + 1}</p>
              <p className="mt-1 font-medium text-white">{name}</p>
            </div>
          ))}
        </div>
      </div>

      {gameState ? (
        <div className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Game started</p>
          <div className="flex flex-wrap gap-4 text-sm text-slate-200">
            <p>Current turn: Seat {gameState.currentTurn + 1}</p>
            <p>Trump: {gameState.trumpSuit}</p>
            <p>Trick: {gameState.trickNumber}</p>
          </div>
          <div className="rounded-lg bg-slate-950/60 p-3">
            <p className="text-sm text-slate-400">Your hand {seat === null ? '' : `(Seat ${seat + 1})`}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {player?.cards.map((card) => (
                <button
                  key={card.code}
                  type="button"
                  disabled={seat !== gameState.currentTurn}
                  onClick={() => playCard(card)}
                  className="rounded border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-sm text-white transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {card.rank} {card.suit[0]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">
          <p>Waiting for more players to join.</p>
          {allowBots ? (
            <button type="button" onClick={fillWithBots} className="mt-3 rounded-lg border border-amber-400/50 px-3 py-2 font-medium text-amber-300 transition hover:bg-amber-400/10">
              Fill with 3 test bots
            </button>
          ) : null}
        </div>
      )}
      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
