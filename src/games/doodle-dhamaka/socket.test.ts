import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { Server } from 'socket.io';
import { brushesFor } from './dhamakas';
import type { DoodleView, Stroke } from './types';

/**
 * Doodle Dhamaka over a real socket.
 *
 * The engine tests prove `viewFor` hides the answer. These prove the server
 * actually sends each player only their own view, that a correct guess comes
 * back to the guesser alone, and that the drawing reaches everyone else — the
 * places a leak or a break would really happen.
 */

vi.mock('@/lib/prisma', () => ({
  prisma: {
    room: {
      update: vi.fn(async () => undefined),
      updateMany: vi.fn(async () => undefined),
      findUnique: vi.fn(async () => ({ id: 'room-row', hostId: 'p0' })),
    },
    match: { create: vi.fn(async () => ({ id: 'match-row' })) },
  },
}));

const { createSocketServer } = await import('@/socket/server');

let httpServer: HttpServer;
let ioServer: Server;
let url: string;
const clients: Socket[] = [];
let nextCode = 0;
const freshCode = () => `D${(nextCode += 1).toString().padStart(3, '0')}`;

beforeEach(async () => {
  httpServer = createServer();
  ioServer = createSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const client of clients) client.disconnect();
  clients.length = 0;
  await ioServer.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

interface Seat {
  id: string;
  client: Socket;
  view: DoodleView | null;
  /** Everything this client was ever sent, as text, to catch a leak anywhere. */
  wire: string[];
  strokes: Stroke[];
}

async function sit(code: string, id: string): Promise<Seat> {
  const client = ioClient(url, { transports: ['websocket'], forceNew: true });
  clients.push(client);
  const seat: Seat = { id, client, view: null, wire: [], strokes: [] };
  client.onAny((event, payload) => seat.wire.push(`${event} ${JSON.stringify(payload)}`.toLowerCase()));
  client.on('doodle:state', (view: DoodleView | null) => {
    seat.view = view;
  });
  client.on('doodle:op', ({ op }: { op: { kind: string; stroke?: Stroke } }) => {
    if (op.kind === 'start' && op.stroke) seat.strokes.push(op.stroke);
  });
  await new Promise<void>((resolve) => client.on('connect', () => resolve()));
  await new Promise<void>((resolve) => {
    client.once('doodle:joined', () => resolve());
    client.emit('doodle:join', { roomCode: code, playerId: id, playerName: id.toUpperCase() });
  });
  return seat;
}

/**
 * A pen stroke this round will actually accept. The round's Dhamakas are random,
 * and under Tiny Pen or One Color a hard-coded brush is — correctly — refused.
 */
const penStart = (view: DoodleView, id: string, point: [number, number] = [0.5, 0.5]) => ({
  kind: 'start',
  id,
  tool: 'pen',
  color: view.round.onlyColor ?? view.round.roulette?.[0] ?? '#1f1b2e',
  size: brushesFor(view.round.dhamakas)[0],
  point,
});

const ask = <T = { error?: string }>(client: Socket, event: string, payload: Record<string, unknown>) =>
  new Promise<T>((resolve) => client.emit(event, payload, resolve));

async function table(count: number) {
  const code = freshCode();
  const seats: Seat[] = [];
  for (let index = 0; index < count; index += 1) seats.push(await sit(code, `p${index}`));
  return { code, seats };
}

/** Starts a game, and has the drawer choose, so there is a secret on the table. */
async function drawing(count = 4) {
  const { code, seats } = await table(count);
  expect(await ask(seats[0].client, 'doodle:start', { roomCode: code })).toEqual({});
  await vi.waitFor(() => expect(seats.every((seat) => seat.view?.phase === 'CHOOSING')).toBe(true));

  const drawerId = seats[0].view!.round.drawerId;
  const drawer = seats.find((seat) => seat.id === drawerId)!;
  await vi.waitFor(() => expect(drawer.view?.round.choices).toHaveLength(3));
  // The easy word, so the tests know how to guess it.
  const prompt = drawer.view!.round.choices![0];
  expect(await ask(drawer.client, 'doodle:choose', { roomCode: code, promptId: prompt.id })).toEqual({});
  await vi.waitFor(() => expect(seats.every((seat) => seat.view?.phase === 'DRAWING')).toBe(true));

  const guessers = seats.filter((seat) => seat.id !== drawerId);
  return { code, seats, drawer, guessers, answer: prompt.text };
}

describe('a Doodle Dhamaka table', () => {
  it('will not start with fewer than four people', async () => {
    const { code, seats } = await table(3);
    const reply = await ask(seats[0].client, 'doodle:start', { roomCode: code });
    expect(reply.error).toMatch(/at least 4/);
  });

  it('can be lowered to two for local testing, but never in production', async () => {
    const saved = { min: process.env.DOODLE_MIN_PLAYERS, env: process.env.NODE_ENV };
    try {
      process.env.DOODLE_MIN_PLAYERS = '2';
      const { code, seats } = await table(2);
      expect(await ask(seats[0].client, 'doodle:start', { roomCode: code })).toEqual({});

      vi.stubEnv('NODE_ENV', 'production');
      const prod = await table(2);
      expect((await ask(prod.seats[0].client, 'doodle:start', { roomCode: prod.code })).error).toMatch(/at least 4/);
    } finally {
      vi.unstubAllEnvs();
      if (saved.min === undefined) delete process.env.DOODLE_MIN_PLAYERS;
      else process.env.DOODLE_MIN_PLAYERS = saved.min;
    }
  });

  it('only lets the host start', async () => {
    const { code, seats } = await table(4);
    const reply = await ask(seats[1].client, 'doodle:start', { roomCode: code });
    expect(reply.error).toMatch(/Only P0/);
  });

  it('sends the word choices to the drawer and to nobody else', async () => {
    const { code, seats } = await table(4);
    await ask(seats[0].client, 'doodle:start', { roomCode: code });
    await vi.waitFor(() => expect(seats.every((seat) => seat.view?.phase === 'CHOOSING')).toBe(true));
    const drawerId = seats[0].view!.round.drawerId;
    const drawer = seats.find((seat) => seat.id === drawerId)!;
    await vi.waitFor(() => expect(drawer.view?.round.choices).toHaveLength(3));
    const words = drawer.view!.round.choices!.map((choice) => choice.text.toLowerCase());
    for (const seat of seats.filter((entry) => entry.id !== drawerId)) {
      for (const word of words) expect(seat.wire.join('\n')).not.toContain(`"${word}"`);
    }
  });

  it('never sends the answer down a guesser’s wire, even after someone else gets it', async () => {
    const { code, drawer, guessers, answer } = await drawing();
    const [winner, ...rest] = guessers;

    const reply = await ask<{ outcome?: { kind: string } }>(winner.client, 'doodle:guess', { roomCode: code, text: answer });
    expect(reply.outcome?.kind).toBe('correct');

    await vi.waitFor(() =>
      expect(rest.every((seat) => seat.view?.round.solvedBy.includes(winner.id))).toBe(true),
    );
    for (const seat of rest) {
      expect(seat.view!.round.answer).toBeNull();
      expect(seat.wire.join('\n')).not.toContain(`"${answer.toLowerCase()}"`);
    }
    // The drawer and the winner do know it.
    expect(drawer.view!.round.answer?.text).toBe(answer);
    await vi.waitFor(() => expect(winner.view?.round.answer?.text).toBe(answer));
  });

  it('tells only the guesser whether they were right', async () => {
    const { code, guessers, answer } = await drawing();
    const [winner, other] = guessers;
    const before = other.wire.length;
    await ask(winner.client, 'doodle:guess', { roomCode: code, text: answer });
    await vi.waitFor(() => expect(other.view?.round.solvedBy).toContain(winner.id));
    const sinceThen = other.wire.slice(before).join('\n');
    expect(sinceThen).not.toContain('"outcome"');
    expect(sinceThen).not.toContain('"points"');
  });

  it('relays the drawing to everyone, and refuses it from anyone but the drawer', async () => {
    const { code, drawer, guessers } = await drawing();
    const op = penStart(drawer.view!, 's1', [0.2, 0.3]);
    drawer.client.emit('doodle:draw', { roomCode: code, op });
    await vi.waitFor(() => expect(guessers.every((seat) => seat.strokes.some((stroke) => stroke.id === 's1'))).toBe(true));

    const refused = await ask(guessers[0].client, 'doodle:draw', { roomCode: code, op: { ...op, id: 's2' } });
    expect(refused.error).toMatch(/Only the drawer/);
  });

  it('gives someone arriving mid-round the drawing so far', async () => {
    const { code, drawer } = await drawing();
    drawer.client.emit('doodle:draw', {
      roomCode: code,
      op: penStart(drawer.view!, 'early'),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const late = ioClient(url, { transports: ['websocket'], forceNew: true });
    clients.push(late);
    const canvas = new Promise<{ strokes: Stroke[] }>((resolve) => late.once('doodle:canvas', resolve));
    late.emit('doodle:join', { roomCode: code, playerId: 'late', playerName: 'LATE' });
    expect((await canvas).strokes.map((stroke) => stroke.id)).toContain('early');
  });

  it('keeps each player’s friend words to themselves', async () => {
    const { code, seats } = await table(4);
    expect(await ask(seats[1].client, 'doodle:add-word', { roomCode: code, text: 'Rahul’s bike' })).toEqual({});
    await vi.waitFor(() => expect(seats[0].view === null && seats[0].wire.some((line) => line.includes('"words":1'))).toBe(true));
    for (const seat of [seats[0], seats[2], seats[3]]) {
      expect(seat.wire.join('\n')).not.toContain('bike');
    }
    expect(seats[1].wire.join('\n')).toContain('bike');
  });

  it('refuses a second copy of the same friend word', async () => {
    const { code, seats } = await table(4);
    await ask(seats[1].client, 'doodle:add-word', { roomCode: code, text: 'Goa Trip' });
    const reply = await ask(seats[2].client, 'doodle:add-word', { roomCode: code, text: 'goa  trip' });
    expect(reply.error).toMatch(/already/);
  });
});
