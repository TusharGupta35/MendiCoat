import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { Server } from 'socket.io';
import type { ImpostorView } from './types';

/**
 * Impostor over a real socket.
 *
 * The engine tests prove `viewFor` withholds the question. These prove the
 * server actually sends each player only their own view — which is where a leak
 * would really happen, and the one bug in this game that cannot be laughed off.
 *
 * Every client records everything it is ever sent, so the test can assert the
 * question never appeared anywhere on an impostor's wire, not merely that it
 * was absent from the field the test thought to look at.
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
const freshCode = () => `I${(nextCode += 1).toString().padStart(3, '0')}`;

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
  view: ImpostorView | null;
  /** Everything this client was ever sent, as text, to catch a leak anywhere. */
  wire: string[];
}

async function sit(code: string, id: string): Promise<Seat> {
  const client = ioClient(url, { transports: ['websocket'], forceNew: true });
  clients.push(client);
  const seat: Seat = { id, client, view: null, wire: [] };
  client.onAny((event, payload) => seat.wire.push(`${event} ${JSON.stringify(payload)}`.toLowerCase()));
  client.on('imp:state', (view: ImpostorView | null) => {
    seat.view = view;
  });
  await new Promise<void>((resolve) => client.on('connect', () => resolve()));
  await new Promise<void>((resolve) => {
    client.once('imp:joined', () => resolve());
    client.emit('imp:join', { roomCode: code, playerId: id, playerName: id.toUpperCase() });
  });
  return seat;
}

const ask = (seat: Seat, event: string, payload: Record<string, unknown>) =>
  new Promise<{ error?: string }>((resolve) => {
    seat.client.emit(event, { roomCode: seat.view?.roomCode ?? payload.roomCode, ...payload }, resolve);
  });

/**
 * Wait until every seat's view satisfies the predicate.
 *
 * The default outlasts the role card, which holds the table for five seconds
 * before the first answer is even possible — a shorter wait here fails on the
 * game working correctly.
 */
async function settle(seats: Seat[], ready: (seat: Seat) => boolean, ms = 9_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (seats.every(ready)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('The table never got there.');
}

/** Four seats, a started game, and everyone holding a view of the first round. */
async function table() {
  const code = freshCode();
  const seats = await Promise.all(['p0', 'p1', 'p2', 'p3'].map((id) => sit(code, id)));
  const started = await ask(seats[0], 'imp:start', { roomCode: code });
  expect(started.error).toBeUndefined();
  await settle(seats, (seat) => seat.view !== null);
  return { code, seats };
}

describe('the question never reaches an impostor', () => {
  it('sends the question to the crew and a hole to the impostor', async () => {
    const { seats } = await table();

    const impostors = seats.filter((seat) => seat.view!.round.youAreImpostor);
    expect(impostors).toHaveLength(1);
    expect(impostors[0].view!.round.question).toBeNull();
    expect(impostors[0].view!.round.format.label.length).toBeGreaterThan(0);

    const crew = seats.filter((seat) => !seat.view!.round.youAreImpostor);
    expect(crew).toHaveLength(3);
    const asked = crew[0].view!.round.question!.text;
    crew.forEach((seat) => expect(seat.view!.round.question!.text).toBe(asked));
  });

  it("never puts the question anywhere on the impostor's wire", async () => {
    const { seats } = await table();
    const impostor = seats.find((seat) => seat.view!.round.youAreImpostor)!;
    const crew = seats.find((seat) => !seat.view!.round.youAreImpostor)!;
    const asked = crew.view!.round.question!.text.toLowerCase();

    // Not just the field the test remembered to check — anywhere at all.
    impostor.wire.forEach((line) => expect(line).not.toContain(asked));
  });

  it('never tells anybody who the impostor is before the reveal', async () => {
    const { seats } = await table();
    const impostor = seats.find((seat) => seat.view!.round.youAreImpostor)!;

    seats
      .filter((seat) => seat.id !== impostor.id)
      .forEach((seat) => {
        expect(seat.view!.round.impostorIds).toBeNull();
        seat.wire.forEach((line) => expect(line).not.toContain(`"impostorids":["${impostor.id}"]`));
      });
  });
});

describe('playing over the wire', () => {
  it('takes answers in turn and refuses them out of turn', async () => {
    const { code, seats } = await table();
    await settle(seats, (seat) => seat.view!.phase === 'ANSWER');

    const view = seats[0].view!;
    const turn = seats.find((seat) => seat.id === view.round.answeringId)!;
    const waiting = seats.find((seat) => seat.id !== view.round.answeringId)!;

    const early = await ask(waiting, 'imp:answer', { roomCode: code, text: '7' });
    expect(early.error).toBe('Wait your turn.');

    const answer = view.round.format.kind === 'number' ? '7' : 'pizza';
    const mine = await ask(turn, 'imp:answer', { roomCode: code, text: answer });
    expect(mine.error).toBeUndefined();

    await settle(seats, (seat) => seat.view!.round.answers.length === 1);
    seats.forEach((seat) => expect(seat.view!.round.answers[0].playerId).toBe(turn.id));
  });

  it('keeps votes sealed on the wire while the round is still running', async () => {
    const { code, seats } = await table();
    await settle(seats, (seat) => seat.view!.phase === 'ANSWER');

    // Answer for everybody, in whatever order the round drew.
    for (let index = 0; index < seats.length; index += 1) {
      const view = seats[0].view!;
      const turn = seats.find((seat) => seat.id === view.round.answeringId);
      if (!turn) break;
      const answer = view.round.format.kind === 'number' ? '7' : 'pizza';
      await ask(turn, 'imp:answer', { roomCode: code, text: answer });
      await settle(seats, (seat) => seat.view!.round.answers.length === index + 1);
    }

    // Whether the round went to discussion or — under Chup — straight to the
    // vote, one thing holds until the reveal: nobody is sent anybody's vote.
    // Khulla Vote is the deliberate exception, so it is excluded by name.
    const open = seats[0].view!.round.chaal === 'khulla-vote';
    await ask(seats[0], 'imp:vote', { roomCode: code, targetId: seats[1].id });
    await new Promise((resolve) => setTimeout(resolve, 150));

    seats.forEach((seat) => {
      if (seat.view!.phase === 'REVEAL' || seat.view!.phase === 'ROUND_END') return;
      if (open) expect(seat.view!.round.votes).not.toBeNull();
      else expect(seat.view!.round.votes).toBeNull();
    });
  });

  it('lets only the host start and change the mode', async () => {
    const code = freshCode();
    const seats = await Promise.all(['p0', 'p1', 'p2', 'p3'].map((id) => sit(code, id)));

    const notHost = await ask(seats[1], 'imp:start', { roomCode: code });
    expect(notHost.error).toContain('Only P0');

    const mode = await ask(seats[1], 'imp:mode', { roomCode: code, mode: 'chaos' });
    expect(mode.error).toContain('Only P0');

    expect((await ask(seats[0], 'imp:mode', { roomCode: code, mode: 'chaos' })).error).toBeUndefined();
  });

  it('refuses to start without enough people', async () => {
    const code = freshCode();
    const seats = await Promise.all(['p0', 'p1'].map((id) => sit(code, id)));
    const tooFew = await ask(seats[0], 'imp:start', { roomCode: code });
    expect(tooFew.error).toContain('at least');
  });

  it("keeps one table's questions out of another's lobby", async () => {
    const code = freshCode();
    const [host, other] = await Promise.all([sit(code, 'p0'), sit(code, 'p1')]);

    const added = await ask(host, 'imp:add-question', {
      roomCode: code,
      text: 'Who would forget their own birthday?',
    });
    expect(added.error).toBeUndefined();

    // The author sees their own; nobody else sees the text, only the count.
    await new Promise((resolve) => setTimeout(resolve, 150));
    other.wire.forEach((line) => expect(line).not.toContain('forget their own birthday'));
  });
});
