import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { Server } from 'socket.io';
import { chooseBotCard } from '@/game-engine/bot';
import type { GameState, SeatIndex } from '@/types/game';

/**
 * The series as the database and the room see it, driven through real matches.
 *
 * A series lives in this process's memory, so the only thing that carries it
 * into the match record is the id stamped on every row. These tests play whole
 * matches through the socket API to check that stamp survives a rematch, a
 * length change and a new series — none of which is visible from match-store's
 * own tests, which never see a room.
 */

/** Every series a match was opened or closed under, in order. */
const { opened, closed } = vi.hoisted(() => ({
  opened: [] as Array<{ id: string; target: number }>,
  closed: [] as Array<{ id: string; target: number }>,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    room: { update: vi.fn(async () => {}), updateMany: vi.fn(async () => {}) },
  },
}));

vi.mock('@/socket/match-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/socket/match-store')>();
  return {
    ...actual,
    openMatch: vi.fn(async (_code, _seats, _state, series) => {
      opened.push({ ...series });
      return `match-${opened.length}`;
    }),
    closeMatch: vi.fn(async (_id, _code, _seats, _state, _tricks, series) => {
      closed.push({ ...series });
    }),
  };
});

const { createSocketServer } = await import('./server');

let httpServer: HttpServer;
let ioServer: Server;
let url: string;
const clients: Socket[] = [];

/** Room codes are module-global on the server, so each test needs its own. */
let nextRoomCode = 0;
const freshRoomCode = () => `S${(nextRoomCode += 1).toString().padStart(3, '0')}`;

beforeEach(async () => {
  opened.length = 0;
  closed.length = 0;
  httpServer = createServer();
  ioServer = createSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
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

async function seatFourPlayers(roomCode: string) {
  const seated: Socket[] = [];
  for (const [index, team] of (['A', 'B', 'A', 'B'] as const).entries()) {
    const client = await connect();
    await new Promise((resolve) => {
      client.once('seat-assigned', resolve);
      client.emit('join-room', { roomCode, playerId: `p${index}`, playerName: `P${index}`, team });
    });
    seated.push(client);
  }
  return seated;
}

const ask = (client: Socket, event: string, payload: object) =>
  new Promise<{ error?: string }>((resolve) => client.emit(event, payload, resolve));

/**
 * The latest state the room has broadcast, plus a way to wait for the next one.
 * Waiting on the broadcast rather than polling keeps a 52-card match down to
 * the time the server actually takes.
 */
function watchState(client: Socket) {
  const waiters: Array<() => void> = [];
  const seen = {
    state: undefined as GameState | undefined,
    next() {
      return new Promise<void>((resolve) => waiters.push(resolve));
    },
  };
  client.on('game-state-update', (state: GameState) => {
    seen.state = state;
    while (waiters.length) waiters.shift()!();
  });
  return seen;
}

type Watched = ReturnType<typeof watchState>;

/**
 * Plays a match out to its end, every seat picking a legal card the way a bot
 * would. The cards are dealt at random, so which team wins is not fixed — these
 * tests are about the series bookkeeping around a match, not its result.
 */
async function playOut(players: Socket[], roomCode: string, seen: Watched) {
  for (let move = 0; move < 60; move += 1) {
    if (!seen.state) await seen.next();
    const state = seen.state!;
    if (state.status === 'FINISHED') return state;

    const seat = state.currentTurn as SeatIndex;
    const card = chooseBotCard(state, seat, 'easy');
    if (!card) throw new Error(`seat ${seat} had no legal card`);
    // Queue the wait before the emit, so a fast reply cannot be missed.
    const landed = seen.next();
    players[seat].emit('play-card', { roomCode, card });
    await landed;
  }
  throw new Error('match did not finish');
}

async function playMatch(players: Socket[], roomCode: string, seen: Watched) {
  const opens = opened.length;
  await ask(players[0], opens === 0 ? 'start-game' : 'restart-game', { roomCode });
  await vi.waitFor(() => expect(opened.length).toBe(opens + 1), { interval: 5 });
  return playOut(players, roomCode, seen);
}

describe('a series carries its identity into the match record', () => {
  it('stamps every match of a series with the same id, and closes it under that id', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);
    const seen = watchState(players[0]);

    await playMatch(players, roomCode, seen);
    await playMatch(players, roomCode, seen);

    expect(opened).toHaveLength(2);
    expect(opened[0].id).toBe(opened[1].id);
    await vi.waitFor(() => expect(closed).toHaveLength(2), { interval: 5 });
    // A match is closed under the series it was opened in.
    expect(closed.map((series) => series.id)).toEqual([opened[0].id, opened[0].id]);
    expect(opened[0].target).toBe(3);
  });

  it('starts a new id when a new series is called for', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);
    const seen = watchState(players[0]);

    await playMatch(players, roomCode, seen);
    expect(await ask(players[0], 'new-series', { roomCode })).toEqual({});
    await playMatch(players, roomCode, seen);

    expect(opened[0].id).not.toBe(opened[1].id);
  });

  it('keeps the id when the length is changed, because it is the same contest', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);
    const seen = watchState(players[0]);

    expect(await ask(players[0], 'set-series', { roomCode, target: 4 })).toEqual({});
    await playMatch(players, roomCode, seen);
    await playMatch(players, roomCode, seen);

    expect(opened[0].id).toBe(opened[1].id);
    expect(opened.every((series) => series.target === 4)).toBe(true);
  });
});

describe('the room names a best player of the series', () => {
  /** The series payload as the room last broadcast it. */
  function watchSeries(client: Socket) {
    const seen: { payload?: { target: number; from: number; best: { seat: number; name: string; tricks: number; tens: number } | null } } = {};
    client.on('series', (payload: NonNullable<typeof seen.payload>) => {
      seen.payload = payload;
    });
    return seen;
  }

  it('names nobody before a card has been played', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);
    const series = watchSeries(players[0]);

    await vi.waitFor(() => expect(series.payload).toBeDefined(), { interval: 5 });
    expect(series.payload!.best).toBeNull();
    expect(series.payload!.target).toBe(3);
  });

  it('names the seat leading on tricks and 10s once matches have been played', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);
    const seen = watchState(players[0]);
    const series = watchSeries(players[0]);

    await playMatch(players, roomCode, seen);

    await vi.waitFor(() => expect(series.payload?.best).not.toBeNull(), { interval: 5 });
    const best = series.payload!.best!;
    // Thirteen tricks and four 10s are dealt out every match, so somebody has
    // to have taken some of them, and the name has to be a seat at this table.
    expect(best.tricks).toBeGreaterThan(0);
    expect(best.name).toBe(`P${best.seat}`);
    expect(best.tens).toBeLessThanOrEqual(4);
  });

  it('adds a second match onto the first rather than replacing it', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);
    const seen = watchState(players[0]);
    const series = watchSeries(players[0]);

    await playMatch(players, roomCode, seen);
    await vi.waitFor(() => expect(series.payload?.best).not.toBeNull(), { interval: 5 });
    await playMatch(players, roomCode, seen);
    await vi.waitFor(() => expect(seen.state?.status).toBe('FINISHED'), { interval: 5 });

    // Two matches are 26 tricks and 8 tens, however they were split up.
    await vi.waitFor(() => expect(series.payload!.best!.tricks).toBeGreaterThan(0), {
      interval: 5,
    });
    expect(series.payload!.best!.tricks).toBeLessThanOrEqual(26);
  });

  it('forgets the old tally when a new series starts', async () => {
    const roomCode = freshRoomCode();
    const players = await seatFourPlayers(roomCode);
    const seen = watchState(players[0]);
    const series = watchSeries(players[0]);

    await playMatch(players, roomCode, seen);
    await vi.waitFor(() => expect(series.payload?.best).not.toBeNull(), { interval: 5 });

    await ask(players[0], 'new-series', { roomCode });
    await vi.waitFor(() => expect(series.payload!.best).toBeNull(), { interval: 5 });
  });
});
