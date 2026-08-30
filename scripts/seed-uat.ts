import { config } from 'dotenv';
config({ path: '.env.local' });

/**
 * Fills the database this environment points at with a few weeks of played
 * matches, so the boards, the record card and the progression panels have
 * something to show while the UI is being looked at.
 *
 * Everything it writes is tagged and removable:
 *   - players get @uat.invalid emails
 *   - matches get a seriesId starting "uat-"
 * so `SEED_UAT=clear` takes exactly this data back out and leaves real
 * accounts and real matches alone.
 *
 *   SEED_UAT=yes    npx tsx scripts/seed-uat.ts
 *   SEED_UAT=clear  npx tsx scripts/seed-uat.ts
 *
 * It refuses to run against a database holding more than a handful of matches,
 * because seeded results would be indistinguishable from played ones on a board
 * that people actually care about.
 */

const mode = process.env.SEED_UAT;
if (mode !== 'yes' && mode !== 'clear') {
  console.error('Set SEED_UAT=yes to seed, or SEED_UAT=clear to remove seeded data.');
  process.exit(1);
}

const { prisma } = await import('@/lib/prisma');

const TAG = 'uat-';
const EMAIL_DOMAIN = '@uat.invalid';

const url = process.env.DATABASE_URL ?? '';
console.log(`Database: ${url.replace(/\/\/[^@]*@/, '//***@').split('?')[0]}`);

if (mode === 'clear') {
  const matches = await prisma.match.deleteMany({ where: { seriesId: { startsWith: TAG } } });
  const users = await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  const rooms = await prisma.room.deleteMany({ where: { code: { startsWith: 'UAT' } } });
  console.log(`Removed ${matches.count} matches, ${users.count} players, ${rooms.count} rooms.`);
  await prisma.$disconnect();
  process.exit(0);
}

// Only finished matches count as a record worth protecting; abandoned ones
// are already invisible to every board and every stat.
const real = await prisma.match.count({
  where: { status: 'FINISHED', seriesId: { not: { startsWith: TAG } } },
});
if (real > 5) {
  console.error(
    `Refusing to seed: this database already holds ${real} real matches.\n` +
      `Seeded results would be mixed into boards that mean something.`,
  );
  process.exit(1);
}

/** The cast. Avatars are ids from AVATARS, so they draw rather than fall back. */
const CAST = [
  { username: 'aarav', name: 'Aarav', avatar: 'raja' },
  { username: 'meera_s', name: 'Meera', avatar: 'rani' },
  { username: 'kabir', name: 'Kabir', avatar: 'hustler' },
  { username: 'simran', name: 'Simran', avatar: 'duchess' },
  { username: 'rohit99', name: 'Rohit', avatar: 'shark' },
];

const SUITS = ['S', 'H', 'C', 'D'] as const;
const SUIT_NAME = {
  S: 'SPADES',
  H: 'HEARTS',
  C: 'CLUBS',
  D: 'DIAMONDS',
} as const;
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const shuffled = <T>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

/** A full deck, shuffled, so every match deals the four 10s exactly once. */
function deal() {
  return shuffled(SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}`)));
}

/**
 * Thirteen tricks of four cards, each won by somebody. Winners are drawn with a
 * bias so a match has a shape — one seat having a good night — rather than four
 * players all landing on 25%.
 */
function playOut(strongSeat: number) {
  const deck = deal();
  const weights = [0, 1, 2, 3].map((seat) => (seat === strongSeat ? 3 : 1));
  const bag = weights.flatMap((weight, seat) => Array<number>(weight).fill(seat));
  const trumpTrick = 1 + Math.floor(Math.random() * 4);
  const trumpSuit = pick([...SUITS]);

  return Array.from({ length: 13 }, (_, index) => {
    const cards = deck.slice(index * 4, index * 4 + 4);
    const winnerSeat = pick(bag);
    return {
      trickNumber: index + 1,
      seats: [0, 1, 2, 3],
      cards,
      leadSuit: SUIT_NAME[cards[0].slice(-1) as keyof typeof SUIT_NAME],
      winnerSeat,
      winnerTeam: winnerSeat % 2 === 0 ? 'A' : 'B',
      tensWon: cards.filter((card) => card.startsWith('10')).length,
      fixedTrump: index + 1 === trumpTrick,
      trumpSuit: index + 1 === trumpTrick ? SUIT_NAME[trumpSuit] : null,
    };
  });
}

const players = [] as Array<{ id: string; label: string }>;

for (const person of CAST) {
  const email = `${person.username}${EMAIL_DOMAIN}`;
  const user = await prisma.user.upsert({
    where: { email },
    update: { username: person.username, name: person.name, avatar: person.avatar },
    create: { email, username: person.username, name: person.name, avatar: person.avatar },
  });
  players.push({ id: user.id, label: person.username });
}

// Whoever is already here plays too, so the person doing the testing sees their
// own record fill in rather than an empty card beside a full board.
const existing = await prisma.user.findMany({
  where: { email: { not: { endsWith: EMAIL_DOMAIN } } },
  select: { id: true, username: true, name: true },
});
for (const user of existing) players.push({ id: user.id, label: user.username ?? user.name ?? 'you' });

console.log(`Players at the table: ${players.map((p) => p.label).join(', ')}`);

const host = players[0];
const room = await prisma.room.upsert({
  where: { code: 'UAT1' },
  update: {},
  create: { code: 'UAT1', name: 'UAT table', hostId: host.id },
});

const DAY = 24 * 60 * 60 * 1000;
let written = 0;

// Six series spread over the last three weeks, so the weekly board, the
// all-time board and "last played" all have something different to say.
for (let series = 0; series < 6; series += 1) {
  const seriesId = `${TAG}${Date.now()}-${series}`;
  const target = pick([1, 2, 2, 3]);
  const seated = shuffled(players).slice(0, 4);
  if (seated.length < 4) break;
  const daysAgo = 20 - series * 3.2;

  let winsA = 0;
  let winsB = 0;
  for (let match = 0; match < 7 && winsA < target && winsB < target; match += 1) {
    const strongSeat = Math.floor(Math.random() * 4);
    const tricks = playOut(strongSeat);
    const tens = { A: 0, B: 0 };
    const hands = { A: 0, B: 0 };
    for (const trick of tricks) {
      hands[trick.winnerTeam as 'A' | 'B'] += 1;
      tens[trick.winnerTeam as 'A' | 'B'] += trick.tensWon;
    }
    const winnerTeam = tens.A === tens.B ? (hands.A >= hands.B ? 'A' : 'B') : tens.A > tens.B ? 'A' : 'B';
    if (winnerTeam === 'A') winsA += 1;
    else winsB += 1;

    const finishedAt = new Date(Date.now() - (daysAgo - match * 0.2) * DAY);

    await prisma.match.create({
      data: {
        roomId: room.id,
        hostId: host.id,
        status: 'FINISHED',
        winnerTeam,
        capturedTensA: tens.A,
        capturedTensB: tens.B,
        handsWonA: hands.A,
        handsWonB: hands.B,
        // A couple of the series are against bots, so the boards have something
        // to exclude and the half rate is visible on a record.
        hadBots: series === 4,
        seriesId,
        seriesTarget: target,
        finishedAt,
        createdAt: new Date(finishedAt.getTime() - 15 * 60 * 1000),
        seats: {
          create: seated.map((player, seat) => ({
            userId: player.id,
            seat,
            team: seat % 2 === 0 ? 'A' : 'B',
            won: (seat % 2 === 0 ? 'A' : 'B') === winnerTeam,
          })),
        },
        players: { connect: seated.map((player) => ({ id: player.id })) },
        tricks: { create: tricks },
      },
    });
    written += 1;
  }
}

console.log(`Wrote ${written} finished matches across 6 series.`);
console.log('Undo with: SEED_UAT=clear npx tsx scripts/seed-uat.ts');
await prisma.$disconnect();
