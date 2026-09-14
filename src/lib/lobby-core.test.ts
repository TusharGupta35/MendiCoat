import { describe, expect, it } from 'vitest';
import { FRESH_FOR_MS, splitTables, toOpenTable, type RoomRow } from './lobby-core';

const NOW = new Date('2026-09-13T20:00:00Z');

const seat = (id: string) => ({ id, username: id, name: null, avatar: null, image: null });

function room(over: Partial<RoomRow> = {}): RoomRow {
  return {
    id: 'room-1',
    code: 'A1B2',
    name: "Kabir's Mendi Coat table",
    gameId: 'MENDI_COAT',
    status: 'LOBBY',
    createdAt: NOW,
    updatedAt: NOW,
    hostId: 'kabir',
    host: { username: 'kabir', name: null },
    players: [seat('kabir')],
    ...over,
  };
}

describe('toOpenTable — who the code is printed for', () => {
  it('keeps the code of a table you are not at, so joining still takes an invitation', () => {
    expect(toOpenTable(room(), 'rohan', NOW).code).toBeNull();
  });

  it('prints it to the host', () => {
    expect(toOpenTable(room(), 'kabir', NOW).code).toBe('A1B2');
  });

  it('prints it to somebody already seated', () => {
    const table = toOpenTable(room({ players: [seat('kabir'), seat('neha')] }), 'neha', NOW);
    expect(table.code).toBe('A1B2');
  });
});

describe('toOpenTable — the state the join route would answer with', () => {
  it('is open while the table is in its lobby with a seat free', () => {
    expect(toOpenTable(room(), 'rohan', NOW).state).toBe('open');
  });

  it('is full once every seat is taken', () => {
    const packed = room({ players: ['kabir', 'neha', 'rohan', 'aman'].map(seat) });
    const table = toOpenTable(packed, 'zoya', NOW);
    expect(table.state).toBe('full');
    expect(table.seatsFree).toBe(0);
  });

  it('is playing once a match is under way, whatever the seats say', () => {
    expect(toOpenTable(room({ status: 'PLAYING' }), 'rohan', NOW).state).toBe('playing');
  });

  it('puts a started match ahead of a full table, the order the join route checks in', () => {
    const packed = room({ status: 'PLAYING', players: ['kabir', 'neha', 'rohan', 'aman'].map(seat) });
    expect(toOpenTable(packed, 'zoya', NOW).state).toBe('playing');
  });

  it('goes stale once nobody has touched it for the freshness window', () => {
    const old = room({ updatedAt: new Date(NOW.getTime() - FRESH_FOR_MS - 1000) });
    expect(toOpenTable(old, 'rohan', NOW).state).toBe('stale');
  });

  it('is still going a minute ago', () => {
    const recent = room({ updatedAt: new Date(NOW.getTime() - 60_000) });
    expect(toOpenTable(recent, 'rohan', NOW).state).toBe('open');
  });

  it('counts the seats against the game, not a fixed four', () => {
    const table = toOpenTable(room({ gameId: 'TEEN_KI_TIGDI' }), 'rohan', NOW);
    expect(table.seatsFree).toBe(table.game.maxPlayers - 1);
    expect(table.game.maxPlayers).toBeGreaterThan(4);
  });
});

describe('toOpenTable — whose table it is', () => {
  it('is yours when you host it, even before anybody sits down', () => {
    expect(toOpenTable(room({ players: [] }), 'kabir', NOW).mine).toBe(true);
  });

  it('is not yours when you are neither host nor seated', () => {
    expect(toOpenTable(room(), 'rohan', NOW).mine).toBe(false);
  });
});

describe('splitTables', () => {
  it('puts yours and everybody else\'s in separate piles, order kept', () => {
    const rows = [
      toOpenTable(room({ id: 'a' }), 'kabir', NOW),
      toOpenTable(room({ id: 'b', hostId: 'neha', players: [seat('neha')] }), 'kabir', NOW),
      toOpenTable(room({ id: 'c', hostId: 'neha', players: [seat('neha'), seat('kabir')] }), 'kabir', NOW),
    ];
    const split = splitTables(rows);
    expect(split.mine.map((table) => table.id)).toEqual(['a', 'c']);
    expect(split.global.map((table) => table.id)).toEqual(['b']);
  });
});
