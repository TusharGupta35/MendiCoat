import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { Server } from 'socket.io';
import type { GameState } from '@/types/game';

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
const { closeSocketRoom } = await import('@/lib/room-registry');

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

  it('keeps an abandoned room exactly as it was, so the table can be picked up again', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);
    await startGame(players[0], roomCode);
    await waitForStatus('PLAYING');

    vi.useFakeTimers({ shouldAdvanceTime: true });
    for (const player of players) player.disconnect();
    await waitForStatus('LOBBY');
    // Past the 60s after which an emptied room used to be wiped back to a
    // fresh lobby. Nothing should be waiting on that clock any more.
    vi.advanceTimersByTime(61_000);
    vi.useRealTimers();

    // The seats are still spoken for, so a stranger cannot take one.
    const newcomer = await connect();
    const refusal = new Promise<string>((resolve) => {
      newcomer.once('team-full', () => resolve('refused'));
      newcomer.once('room-full', () => resolve('refused'));
      newcomer.once('game-already-started', () => resolve('refused'));
      newcomer.once('seat-assigned', (seat: number) => resolve(`seated at ${seat}`));
    });
    newcomer.emit('join-room', { roomCode, playerId: 'newcomer', playerName: 'newcomer', team: 'A' });
    expect(await refusal).toBe('refused');

    // And the friend who left gets their own seat, and their match, back.
    const returning = await connect();
    const restored = new Promise<number>((resolve) => returning.once('seat-assigned', resolve));
    const stateSeen = new Promise<GameState>((resolve) =>
      returning.once('game-state-update', resolve),
    );
    returning.emit('restore-seat', { roomCode, playerId: 'player-2' });
    expect(await restored).toBe(2);
    expect((await stateSeen).status).toBe('PLAYING');
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

describe('a seat cannot be traded for a better one by leaving', () => {
  const ask = (client: Socket, event: string, payload: object) =>
    new Promise<{ error?: string }>((resolve) => client.emit(event, payload, resolve));

  /**
   * Time enough away that the room would once have been wiped back to a fresh
   * lobby — which is exactly what let a losing player come back on a new team.
   */
  async function leaveForAWhile(client: Socket) {
    // The fakes go in before the disconnect: the timer that used to wipe the
    // room was armed by the disconnect itself, so installing them afterwards
    // would leave it running on the real clock and never fire it.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    client.disconnect();
    await waitForStatus('LOBBY');
    vi.advanceTimersByTime(61_000);
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  /** The solo-with-bots table, which is where the escape hatch was widest. */
  async function soloTableWithBots(roomCode: string) {
    const host = await connect();
    await joinTeam(host, roomCode, 'player-0', 'A');
    expect(await ask(host, 'fill-bots', { roomCode })).toEqual({});
    return host;
  }

  it('gives a returning player their old seat, not the team they ask for', async () => {
    const roomCode = freshRoomCode();
    const host = await soloTableWithBots(roomCode);

    await leaveForAWhile(host);

    const returning = await connect();
    const seat = await new Promise<number>((resolve) => {
      returning.once('seat-assigned', resolve);
      // Asking for team B: seat 0 is team A, so this is the swap being tried.
      returning.emit('join-room', { roomCode, playerId: 'player-0', playerName: 'player-0', team: 'B' });
    });
    expect(seat).toBe(0);
  });

  it('refuses a team switch once the match has been dealt', async () => {
    const roomCode = freshRoomCode();
    const host = await soloTableWithBots(roomCode);

    await leaveForAWhile(host);

    const returning = await connect();
    await new Promise((resolve) => {
      returning.once('seat-assigned', resolve);
      returning.emit('restore-seat', { roomCode, playerId: 'player-0' });
    });
    expect((await ask(returning, 'switch-team', { roomCode, team: 'B' })).error).toMatch(
      /already started/i,
    );
  });

  it('still lets the table sort itself out while it is only a lobby', async () => {
    const roomCode = freshRoomCode();
    const host = await connect();
    await joinTeam(host, roomCode, 'player-0', 'A');
    // No match dealt, so the waiting room is still the waiting room.
    expect(await ask(host, 'switch-team', { roomCode, team: 'B' })).toEqual({});
  });
});

describe('a room lasts until its host deletes it', () => {
  it('forgets the room and turns out everyone still sitting in it', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);
    await startGame(players[0], roomCode);

    const closed = new Promise<void>((resolve) => players[1].once('room-closed', () => resolve()));
    closeSocketRoom(roomCode);
    await closed;

    // The code is free again. Without this a code handed out a second time
    // would inherit the deleted room's seats and its half-played match.
    const newcomer = await connect();
    await expect(joinTeam(newcomer, roomCode, 'newcomer', 'A')).resolves.toBe(0);
  });
});
