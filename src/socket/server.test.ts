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
      // Every room in these tests is hosted by the player who takes seat 0.
      findUnique: vi.fn(async () => ({ hostId: 'player-0' })),
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

describe('only the host runs the table', () => {
  const ask = (client: Socket, event: string, payload: object) =>
    new Promise<{ error?: string }>((resolve) => client.emit(event, payload, resolve));

  it('refuses a start from anyone but the host', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);

    // player-1 is at the table, but player-0 made the room.
    const refused = await startGame(players[1], roomCode);
    expect(refused.error).toMatch(/player-0/);
    expect(await startGame(players[0], roomCode)).toEqual({});
  });

  it('refuses a series change from anyone but the host', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);

    expect((await ask(players[2], 'set-series', { roomCode, target: 1 })).error).toMatch(/player-0/);
    expect((await ask(players[2], 'new-series', { roomCode })).error).toMatch(/player-0/);
    expect(await ask(players[0], 'set-series', { roomCode, target: 1 })).toEqual({});
    expect(await ask(players[0], 'new-series', { roomCode })).toEqual({});
  });

  it('names the host in the room payload', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);

    const admin = await new Promise<{ id: string; name: string; isHost: boolean } | null>(
      (resolve) => {
        players[1].once('room-update', (payload: { admin: { id: string; name: string; isHost: boolean } | null }) =>
          resolve(payload.admin),
        );
        players[1].emit('watch-room', { roomCode });
      },
    );
    expect(admin).toMatchObject({ id: 'player-0', isHost: true });
  });

  it('hands the table to the next seat when the host is away, so it cannot freeze', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);

    players[0].disconnect();
    // The room still has three humans in it; seat 1 is the lowest one left.
    await vi.waitFor(async () => {
      expect(await ask(players[1], 'set-series', { roomCode, target: 2 })).toEqual({});
    });
    expect((await ask(players[2], 'set-series', { roomCode, target: 3 })).error).toMatch(/player-1/);
  });
});
