import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { Server } from 'socket.io';
import type { TigdiView } from './types';

/**
 * Teen Ki Tigdi over a real socket.
 *
 * The engine's own tests already prove `viewFor` redacts correctly. These prove
 * the server actually uses it — that what leaves the process down each seat's
 * own connection carries no other hand and no partner who has not given
 * themselves away. Any change that broadcast the state instead would pass every
 * engine test and fail here, which is the whole point of testing it at this
 * level.
 */

vi.mock('@/lib/prisma', () => ({
  prisma: {
    room: {
      update: vi.fn(async () => undefined),
      updateMany: vi.fn(async () => undefined),
      // Every room in these tests is hosted by whoever takes seat 0.
      findUnique: vi.fn(async () => ({ hostId: 'player-0' })),
    },
  },
}));

const { createSocketServer } = await import('@/socket/server');

let httpServer: HttpServer;
let ioServer: Server;
let url: string;
const clients: Socket[] = [];

let nextRoomCode = 0;
const freshRoomCode = () => `K${(nextRoomCode += 1).toString().padStart(3, '0')}`;

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

function connect() {
  return new Promise<Socket>((resolve) => {
    const client = ioClient(url, { transports: ['websocket'], forceNew: true });
    clients.push(client);
    client.on('connect', () => resolve(client));
  });
}

/** The latest view each client has been sent, kept as they arrive. */
function track(client: Socket) {
  const box: { view: TigdiView | null } = { view: null };
  client.on('tigdi:state', (payload: TigdiView | null) => {
    box.view = payload;
  });
  return box;
}

function join(client: Socket, roomCode: string, playerId: string) {
  return new Promise<number>((resolve) => {
    client.once('tigdi:seat', resolve);
    client.emit('tigdi:join', { roomCode, playerId, playerName: playerId });
  });
}

const ask = (client: Socket, event: string, payload: Record<string, unknown>) =>
  new Promise<{ error?: string }>((resolve) => client.emit(event, payload, resolve));

type Seated = Array<{ client: Socket; box: { view: TigdiView | null }; seat: number }>;

/**
 * Where the hand has got to, as one string.
 *
 * Every seat is sent its own object, so they arrive one after another rather
 * than together. Comparing this across the table is how a test knows the whole
 * room has caught up before it reads anything — otherwise it is reading seat
 * 3's answer to the previous question.
 */
const mark = (view: TigdiView) =>
  `${view.phase}|${view.trickNumber}|${view.trickCards.length}|${view.currentTurn}|${view.bidLog.length}`;

/** Waits until every seat has been sent the same moment of the same hand. */
async function sync(seated: Seated) {
  await vi.waitFor(() => {
    const base = seated[0].box.view;
    expect(base).not.toBeNull();
    for (const { box } of seated) {
      expect(box.view).not.toBeNull();
      expect(mark(box.view!)).toBe(mark(base!));
    }
  });
}

/** Makes a move and waits for the whole table to be told about it. */
async function move(
  seated: Seated,
  seat: number,
  event: string,
  payload: Record<string, unknown>,
) {
  const before = mark(seated[0].box.view!);
  expect(await ask(seated[seat].client, event, payload)).toEqual({});
  await vi.waitFor(() => expect(mark(seated[0].box.view!)).not.toBe(before));
  await sync(seated);
}

/** Seats `count` humans and deals a hand, with seat 0 running the table. */
async function seatAndDeal(count: number) {
  const roomCode = freshRoomCode();
  const seated: Array<{ client: Socket; box: ReturnType<typeof track>; seat: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const client = await connect();
    const box = track(client);
    const seat = await join(client, roomCode, `player-${index}`);
    seated.push({ client, box, seat });
  }
  if (count !== 7) {
    // The table defaults to seven; the others have to say so first.
    expect(await ask(seated[0].client, 'tigdi:set-seats', { roomCode, count })).toEqual({});
  }
  expect(await ask(seated[0].client, 'tigdi:start', { roomCode })).toEqual({});
  await sync(seated);
  return { roomCode, seated };
}

/** Bids the minimum from whoever is on turn until the contract is up for grabs. */
async function winTheBidding(
  roomCode: string,
  seated: Awaited<ReturnType<typeof seatAndDeal>>['seated'],
) {
  const opener = seated[0].box.view!.currentTurn;
  await move(seated, opener, 'tigdi:bid', { roomCode, amount: 130 });
  for (let step = 1; step < seated.length; step += 1) {
    await move(seated, (opener + step) % seated.length, 'tigdi:bid', { roomCode, amount: null });
  }
  expect(seated[0].box.view!.phase).toBe('CALLING');
  return opener;
}

describe('a Teen Ki Tigdi table', () => {
  it('deals every seat its own hand and nobody else’s', async () => {
    const { seated } = await seatAndDeal(5);

    for (const { box, seat } of seated) {
      const view = box.view!;
      expect(view.you).toBe(seat);
      expect(view.players[seat].cards).toHaveLength(10);
      // Every other seat arrives as a count, never as cards.
      const others = view.players.filter((player) => player.seat !== seat);
      expect(others.every((player) => player.cards === null)).toBe(true);
      expect(others.every((player) => player.cardsLeft === 10)).toBe(true);
    }

    // And no two seats were dealt the same card.
    const dealt = seated.flatMap(({ box, seat }) =>
      box.view!.players[seat].cards!.map((card) => card.code),
    );
    expect(new Set(dealt).size).toBe(50);
  });

  it('tells a called partner they are one, and tells nobody else', async () => {
    const { roomCode, seated } = await seatAndDeal(5);
    const bidder = await winTheBidding(roomCode, seated);

    // Call a card out of the next seat's hand, so we know who the partner is.
    const partner = (bidder + 1) % seated.length;
    const called = seated[partner].box.view!.players[partner].cards![0].code;
    await move(seated, bidder, 'tigdi:contract', {
      roomCode,
      trumpSuit: 'HEARTS',
      calledCards: [called],
    });

    // The partner has been told, because it is their own seat.
    expect(seated[partner].box.view!.players[partner].team).toBe('BIDDER');

    // Everybody else sees an unreadable seat there. The bidder is the one
    // exception: winning the auction is public.
    for (const { box, seat } of seated) {
      const view = box.view!;
      if (seat === partner) continue;
      expect(view.players[partner].team).toBeNull();
      expect(view.players[bidder].team).toBe('BIDDER');
    }

    // The called card itself is public — which card, never who holds it.
    expect(seated[2].box.view!.calledCards).toEqual([called]);
    expect(seated[2].box.view!.revealed).toEqual({});
  });

  it('names the partner to the whole table once the called card is played', async () => {
    const { roomCode, seated } = await seatAndDeal(5);
    const bidder = await winTheBidding(roomCode, seated);
    const partner = (bidder + 1) % seated.length;

    // Call the partner's lowest card so it is the one they can lead later.
    const partnerCards = seated[partner].box.view!.players[partner].cards!;
    const called = partnerCards[partnerCards.length - 1].code;
    await move(seated, bidder, 'tigdi:contract', {
      roomCode,
      trumpSuit: 'HEARTS',
      calledCards: [called],
    });

    // Play on, always preferring the called card, until it reaches the table.
    for (let played = 0; played < 50; played += 1) {
      const view = seated[0].box.view!;
      if (view.revealed[called] !== undefined) break;
      const turn = view.currentTurn;
      const hand = seated[turn].box.view!.players[turn].cards!;
      const lead = view.trickCards[0]?.card.suit;
      const followable = lead ? hand.filter((card) => card.suit === lead) : hand;
      const legal = followable.length > 0 ? followable : hand;
      const choice = legal.find((card) => card.code === called) ?? legal[0];
      await move(seated, turn, 'tigdi:play', { roomCode, card: choice });
    }

    const view = seated[2].box.view!;
    expect(view.revealed[called]).toBe(partner);
    // Now that the card is down, the whole table can read that seat.
    expect(view.players[partner].team).toBe('BIDDER');
  });

  it('sends no running team total down any wire while the hand is live', async () => {
    const { roomCode, seated } = await seatAndDeal(5);
    const bidder = await winTheBidding(roomCode, seated);
    const partner = (bidder + 1) % seated.length;
    const called = seated[partner].box.view!.players[partner].cards![0].code;
    await move(seated, bidder, 'tigdi:contract', {
      roomCode,
      trumpSuit: 'HEARTS',
      calledCards: [called],
    });

    // Play a full trick, so somebody has certainly captured points.
    for (let step = 0; step < seated.length; step += 1) {
      const view = seated[0].box.view!;
      const turn = view.currentTurn;
      const hand = seated[turn].box.view!.players[turn].cards!;
      const lead = view.trickCards[0]?.card.suit;
      const followable = lead ? hand.filter((c) => c.suit === lead) : hand;
      await move(seated, turn, 'tigdi:play', {
        roomCode,
        card: (followable.length > 0 ? followable : hand)[0],
      });
    }

    for (const { box } of seated) {
      const view = box.view!;
      // A team total moving would name whoever just took that trick.
      expect(view.points).toBeNull();
      // What each seat captured is public, and does add up.
      expect(view.pointsBySeat.reduce((sum, points) => sum + points, 0)).toBeGreaterThanOrEqual(0);
      expect(view.pointsBySeat).toHaveLength(seated.length);
    }
    // Somebody took that trick, so the public per-seat total moved.
    expect(seated[0].box.view!.tricksBySeat.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('refuses a seat that tries to play out of turn', async () => {
    const { roomCode, seated } = await seatAndDeal(5);
    const view = seated[0].box.view!;
    const notTheirTurn = (view.currentTurn + 1) % seated.length;
    const result = await ask(seated[notTheirTurn].client, 'tigdi:bid', {
      roomCode,
      amount: 130,
    });
    expect(result.error).toBeDefined();
  });

  it('will not shrink a table under the people already sitting at it', async () => {
    const roomCode = freshRoomCode();
    for (let index = 0; index < 6; index += 1) {
      const client = await connect();
      await join(client, roomCode, `player-${index}`);
      clients.push(client);
    }
    const host = clients[0];
    const result = await ask(host, 'tigdi:set-seats', { roomCode, count: 5 });
    expect(result.error).toContain('leave');
  });
});
