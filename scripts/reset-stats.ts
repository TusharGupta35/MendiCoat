import { config } from 'dotenv';
config({ path: '.env.local' });

/**
 * Wipes every player's record: matches, seats, trick logs and worn titles.
 *
 * Levels, XP, milestones, feats, challenges, partner records and both
 * leaderboards are all derived from the match tables — nothing is stored — so
 * deleting those rows is the reset. Accounts, usernames and avatars are left
 * alone: this clears what was played, not who plays.
 *
 * Titles go too. A worn title is stored as an id on the user and re-checked
 * against what they have earned, so a title left behind after a reset would be
 * one nobody can earn back yet.
 *
 * Run it with the confirmation the script asks for, so it cannot happen by a
 * stray shell-history arrow key:
 *
 *   RESET_STATS=yes-wipe-everything npx tsx scripts/reset-stats.ts
 */

const CONFIRMATION = 'yes-wipe-everything';

if (process.env.RESET_STATS !== CONFIRMATION) {
  console.error(
    `Refusing to run. This deletes every match ever played.\n` +
      `If that is what you want:\n\n  RESET_STATS=${CONFIRMATION} npx tsx scripts/reset-stats.ts\n`,
  );
  process.exit(1);
}

const { prisma } = await import('@/lib/prisma');

const url = process.env.DATABASE_URL ?? '';
// Enough of the host to see which database is about to be emptied, without
// printing the credentials in it.
console.log(`Database: ${url.replace(/\/\/[^@]*@/, '//***@').split('?')[0]}`);

const before = {
  matches: await prisma.match.count(),
  seats: await prisma.matchPlayer.count(),
  tricks: await prisma.matchTrick.count(),
  titles: await prisma.user.count({ where: { NOT: { title: null } } }),
};
console.log('Before:', before);

// MatchPlayer and MatchTrick cascade from Match, but they are deleted first
// and explicitly so the counts below mean something if a cascade is ever
// changed in the schema.
const tricks = await prisma.matchTrick.deleteMany({});
const seats = await prisma.matchPlayer.deleteMany({});
const matches = await prisma.match.deleteMany({});
const titles = await prisma.user.updateMany({ data: { title: null } });

console.log('Deleted:', {
  tricks: tricks.count,
  seats: seats.count,
  matches: matches.count,
  titlesCleared: titles.count,
});

const after = {
  matches: await prisma.match.count(),
  seats: await prisma.matchPlayer.count(),
  tricks: await prisma.matchTrick.count(),
};
console.log('After:', after);
console.log('\nEvery player is back to level 1. Rooms and accounts are untouched.');

await prisma.$disconnect();
// RESET_STATS=yes-wipe-everything npx tsx scripts/reset-stats.ts