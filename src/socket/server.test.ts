import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { Server } from 'socket.io';

// Every Room.status write the socket server makes, in order.
const { statusWrites } = vi.hoisted(() => ({
  statusWrites: [] as Array<{ code: string; status: string }>,
}));

const { staleResets } = vi.hoisted(() => ({ staleResets: { count: 0 } }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    room: {
      update: vi.fn(async ({ where, data }: { where: { code: string }; data: { status: string } }) => {
        statusWrites.push({ code: where.code, status: data.status });
      }),
      updateMany: vi.fn(async () => {
        staleResets.count += 1;
      }),
    },
  },
}));

const { createSocketServer } = await import('./server');

let httpServer: HttpServer;
let ioServer: Server;
let url: string;
const clients: Socket[] = [];

/** Room codes are module-global on the server, so each test needs its own. */
let nextRoomCode = 0;
function freshRoomCode() {
  nextRoomCode += 1;
  return `T${nextRoomCode.toString().padStart(3, '0')}`;
}

beforeEach(async () => {
  statusWrites.length = 0;
  staleResets.count = 0;
  httpServer = createServer();
  ioServer = createSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  // A test that fails mid-way must not leave fake timers installed.
  vi.useRealTimers();
  for (const client of clients) client.disconnect();
  clients.length = 0;
  await ioServer.close();
  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });
});

function connect() {
  return new Promise<Socket>((resolve) => {
    const client = ioClient(url, { transports: ['websocket'], forceNew: true });
    clients.push(client);
    client.on('connect', () => resolve(client));
  });
}

function joinTeam(client: Socket, roomCode: string, playerId: string, team: 'A' | 'B') {
  return new Promise<number>((resolve) => {
    client.once('seat-assigned', resolve);
    client.emit('join-room', { roomCode, playerId, playerName: playerId, team });
  });
}

function startGame(client: Socket, roomCode: string) {
  return new Promise<{ error?: string }>((resolve) => {
    client.emit('start-game', { roomCode }, resolve);
  });
}

/** The status write rides an async import chain, so poll rather than assume. */
async function waitForStatus(status: string, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (statusWrites.at(-1)?.status !== status) {
    if (Date.now() > deadline) {
      throw new Error(`expected status ${status}, saw ${JSON.stringify(statusWrites)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function seatFourPlayers(roomCode: string) {
  const seated: Socket[] = [];
  for (const [index, team] of (['A', 'B', 'A', 'B'] as const).entries()) {
    const client = await connect();
    await joinTeam(client, roomCode, `player-${index}`, team);
    seated.push(client);
  }
  return seated;
}

describe('room status tracks whether a live match has anyone in it', () => {
  it('clears rooms a previous process left stranded in PLAYING', async () => {
    // The server boots in beforeEach; the sweep rides an async import, so it
    // may already have landed by the time this body runs.
    await vi.waitFor(() => expect(staleResets.count).toBe(1));
  });

  it('stays in the lobby while players are only picking teams', async () => {
    const roomCode = freshRoomCode();
    await seatFourPlayers(roomCode);
    await waitForStatus('LOBBY');
    expect(statusWrites.every((write) => write.status === 'LOBBY')).toBe(true);
  });

  it('goes to PLAYING when the match starts', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);
    expect(await startGame(players[0], roomCode)).toEqual({});
    await waitForStatus('PLAYING');
  });

  it('returns to the lobby once every player has left a live match', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);
    await startGame(players[0], roomCode);
    await waitForStatus('PLAYING');

    for (const player of players) player.disconnect();
    await waitForStatus('LOBBY');
  });

  it('goes back to PLAYING as soon as one player returns to the match', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);
    await startGame(players[0], roomCode);
    await waitForStatus('PLAYING');
    for (const player of players) player.disconnect();
    await waitForStatus('LOBBY');

    const returning = await connect();
    returning.emit('restore-seat', { roomCode, playerId: 'player-0' });
    await waitForStatus('PLAYING');
  });

  it('hands an abandoned room back to a fresh lobby after the grace period', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);
    await startGame(players[0], roomCode);
    await waitForStatus('PLAYING');

    const watcher = await connect();
    const resetSeen = new Promise<void>((resolve) => watcher.once('room-reset', resolve));
    watcher.emit('watch-room', { roomCode });

    // The fakes must be installed before the disconnects that schedule the
    // reset; shouldAdvanceTime keeps socket.io's own timers ticking meanwhile.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    for (const player of players) player.disconnect();
    await waitForStatus('LOBBY');
    vi.advanceTimersByTime(61_000);
    await resetSeen;
    vi.useRealTimers();

    // The seats are free again, so a brand new player can take one.
    const newcomer = await connect();
    await expect(joinTeam(newcomer, roomCode, 'newcomer', 'A')).resolves.toBe(0);
  });

  it('writes a status only when it actually changes', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);
    await startGame(players[0], roomCode);
    await waitForStatus('PLAYING');
    // Four joins and a start produce many emitState passes; the room should
    // still have moved through exactly two states.
    expect(statusWrites.map((write) => write.status)).toEqual(['LOBBY', 'PLAYING']);
  });
});
