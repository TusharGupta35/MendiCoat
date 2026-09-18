import type { AnswerFormat, Category, Difficulty, Question } from './types';

/**
 * The question bank.
 *
 * Questions are the game. Everything else — the Chaals, the steal-back, the
 * scoring — is scaffolding around whether the question was worth arguing about.
 * So these are written to a few rules, and a question that breaks one is worse
 * than no question at all:
 *
 *  - No question has a correct answer. "Capital of France" ends the game.
 *  - No question gives itself away through the shape of its answers. If every
 *    honest answer is a colour, the impostor has the question in one move.
 *  - Every question is answerable in about ten seconds, because that is how
 *    long the answer phase gives you.
 *  - The answers should differ. A question everyone answers the same way hands
 *    the impostor a free ride.
 *
 * Written for this group rather than lifted from a party-game list: rupees, the
 * group chat, the one who is always late.
 */

// ── Answer formats ──────────────────────────────────────────────────────────

const PLAYER: AnswerFormat = { kind: 'player', label: 'Name one person at this table.' };
const RATING: AnswerFormat = { kind: 'number', label: 'A number from 1 to 10.', min: 1, max: 10 };

const count = (label: string, max: number): AnswerFormat => ({ kind: 'number', label, min: 0, max });
const text = (label: string, placeholder: string): AnswerFormat => ({ kind: 'text', label, placeholder });

const FOOD = text('One food item.', 'pani puri…');
const PLACE = text('One place.', 'Manali…');
const MOVIE = text('One film or show.', 'a title…');
const WORD = text('One word.', 'one word only…');
const THING = text('One thing.', 'anything…');
const APP = text('One app or website.', 'an app…');

// ── The bank ────────────────────────────────────────────────────────────────

function ask(
  category: Category,
  emoji: string,
  difficulty: Difficulty,
  format: AnswerFormat,
  questions: string[],
): Question[] {
  return questions.map((body) => ({
    id: `${category}:${body}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 72),
    text: body,
    category,
    emoji,
    difficulty,
    format,
  }));
}

export const QUESTIONS: Question[] = [
  // ── 😂 Funny ───────────────────────────────────────────────────────────────
  ...ask('funny', '😂', 'medium', PLAYER, [
    'Who at this table would survive longest in a zombie apocalypse?',
    'Who would accidentally become famous?',
    'Who would be the worst possible teacher?',
    'Who would get lost even with Google Maps open?',
    'Who would panic first if the lights went out?',
    'Who would be the first to cry during a film?',
    'Who would argue with a waiter over the bill?',
    'Who would be terrible in a hostage situation?',
    'Who would join a cult without noticing?',
    'Who would lose a fight to a monkey?',
    'Who would take the longest to get ready?',
    'Who would forget their own birthday?',
  ]),
  ...ask('funny', '😂', 'hard', THING, [
    'What is something you would be embarrassed to be caught doing?',
    'What is the worst possible gift to receive?',
    'What is a terrible idea that sounds good at 2am?',
    'What is something that is always a red flag?',
    'What is the worst thing to hear from a doctor?',
  ]),

  // ── 🔥 Hot take ────────────────────────────────────────────────────────────
  ...ask('hot-take', '🔥', 'medium', FOOD, [
    'What is the most overrated food?',
    'What food do people pretend to like?',
    'What is the most underrated snack?',
    'What food would you happily never eat again?',
    'What is the best thing to eat at 3am?',
  ]),
  ...ask('hot-take', '🔥', 'medium', MOVIE, [
    'What is a popular film you genuinely did not like?',
    'What is a show everyone quit halfway through?',
    'What film could you rewatch ten times?',
    'What is the most overrated series of the last few years?',
  ]),
  ...ask('hot-take', '🔥', 'hard', APP, [
    'What is the most overrated app on your phone?',
    'What app do you open the most and enjoy the least?',
    'What app should simply not exist?',
  ]),
  ...ask('hot-take', '🔥', 'hard', THING, [
    'What is something everybody loves that you do not understand?',
    'What is a trend you hope dies quickly?',
    'What is the most pointless purchase people keep making?',
    'What is overrated but nobody will admit it?',
  ]),

  // ── 👤 Personal ────────────────────────────────────────────────────────────
  ...ask('personal', '👤', 'medium', THING, [
    'What is something you are surprisingly good at?',
    'What is your biggest guilty pleasure?',
    'What is one thing you could never live without?',
    'What would you buy first if you suddenly became rich?',
    'What is the last thing you spent money on and regretted?',
    'What is something you own far too many of?',
    'What is something you are weirdly strict about?',
  ]),
  ...ask('personal', '👤', 'medium', WORD, [
    'Describe your Monday in one word.',
    'Describe your childhood in one word.',
    'Describe this year so far in one word.',
    'What one word would your boss use about you?',
    'Describe your sleep schedule in one word.',
  ]),
  ...ask('personal', '👤', 'hard', PLACE, [
    'Where would you go if you could teleport right now?',
    'Where is the last place you would want to be stuck overnight?',
    'Where would you move if you had to leave this country tomorrow?',
    'What is the most overrated place you have been to?',
  ]),

  // ── 🧠 Opinion ─────────────────────────────────────────────────────────────
  ...ask('opinion', '🧠', 'medium', THING, [
    'What makes a perfect weekend?',
    'What is the best way to spend a Sunday?',
    'What is the worst part of any wedding?',
    'What is the first thing you notice about a person?',
    'What is the most annoying habit a person can have?',
    'What is the best excuse to get out of plans?',
  ]),
  ...ask('opinion', '🧠', 'hard', count('A number of years.', 99), [
    'What is the best age to be?',
    'How many years until you would like to retire?',
    'How many years could you live in the same house before going mad?',
  ]),

  // ── 👀 People ──────────────────────────────────────────────────────────────
  ...ask('people', '👀', 'easy', PLAYER, [
    'Who would become famous first?',
    'Who would survive longest on a deserted island?',
    'Who would spend a lakh the fastest?',
    'Who is most likely to start a business?',
    'Who would make the best parent?',
    'Who gives the best advice?',
    'Who takes the longest to reply to a message?',
    'Who is most likely to be late to their own wedding?',
    'Who would you call first in an emergency?',
    'Who would you least like to share a room with on a trip?',
    'Who is secretly the most competitive?',
    'Who would win a quiz on everyone else in this group?',
    'Who has the worst taste in music?',
    'Who would last the longest without their phone?',
    'Who would be the best liar?',
  ]),

  // ── 🔢 Number ──────────────────────────────────────────────────────────────
  ...ask('number', '🔢', 'medium', RATING, [
    'Rate your cooking from 1 to 10.',
    'Rate your driving from 1 to 10.',
    'Rate how organised you are from 1 to 10.',
    'Rate your patience from 1 to 10.',
    'Rate how well you handle criticism from 1 to 10.',
    'Rate your luck from 1 to 10.',
    'Rate how competitive you are from 1 to 10.',
    'Rate how good you are at keeping secrets from 1 to 10.',
  ]),
  ...ask('number', '🔢', 'hard', count('A number of days.', 365), [
    'How many days could you survive without your phone?',
    'How many days could you happily live alone?',
    'How long would your savings last if you stopped working?',
  ]),
  ...ask('number', '🔢', 'hard', count('A number of hours.', 24), [
    'How many hours of sleep do you actually need?',
    'How many hours a day do you waste on your phone?',
    'How long is too long to wait for a friend?',
  ]),
];

/**
 * A friend's own question.
 *
 * The format is guessed from the wording, because nobody typing a question into
 * a lobby wants to then be asked what shape its answer is. "Who…" is a table
 * of names; "how many" or "rate" is a number; everything else is short text.
 * A wrong guess here is survivable — the impostor is told the same wrong thing
 * as everybody else, so the round is still fair.
 */
export function friendQuestion(body: string, index: number): Question {
  const trimmed = body.trim();
  const lower = trimmed.toLowerCase();
  const format: AnswerFormat = lower.startsWith('who')
    ? PLAYER
    : /^(how many|how much|how long|rate )/.test(lower)
      ? { kind: 'number', label: 'A number.', min: 0, max: 1000 }
      : text('Keep it short.', 'a few words…');

  return {
    id: `friends:${index}`,
    text: trimmed,
    category: 'friends',
    emoji: '🫂',
    difficulty: 'friends',
    format,
  };
}

export const CATEGORY_LABEL: Record<Category, string> = {
  funny: 'Funny',
  'hot-take': 'Hot take',
  personal: 'Personal',
  opinion: 'Opinion',
  people: 'People',
  number: 'Number',
  friends: 'Friends',
};

/**
 * Questions that could plausibly have produced the same answers, for the
 * steal-back's three choices.
 *
 * Matched on answer format rather than picked at random, which is the whole
 * point: three questions that all want a name make the impostor actually think
 * about what was said. Two decoys wanting a number beside a real one wanting a
 * name would be a free +3.
 */
export function decoysFor(real: Question, pool: Question[], rng: () => number, wanted = 2): Question[] {
  const sameShape = pool.filter(
    (question) =>
      question.id !== real.id &&
      question.format.kind === real.format.kind &&
      question.format.label === real.format.label,
  );
  // A friend's question about this group has no stock question that matches it;
  // anything of the same shape beats offering fewer than three choices.
  const fallback = pool.filter((question) => question.id !== real.id && question.format.kind === real.format.kind);
  const source = sameShape.length >= wanted ? sameShape : fallback;

  const picked: Question[] = [];
  const remaining = [...source];
  while (picked.length < wanted && remaining.length > 0) {
    picked.push(...remaining.splice(Math.floor(rng() * remaining.length), 1));
  }
  return picked;
}
