import type { Difficulty, Prompt } from './types';

/**
 * The word bank.
 *
 * Written for this group rather than translated from a generic list: samosa and
 * pani puri next to penguin and guitar, railway stations and exam nights next
 * to beaches. Four tiers, so the drawer's three choices can always be one easy,
 * one medium and one wild.
 *
 * Scene and combo prompts carry `keywords` — the ideas a guess must contain —
 * so "dog car" gets "Dog driving a car". Nobody should have to type a sentence
 * exactly, and nobody should get it by naming half of it.
 */

type Entry = [text: string, emoji: string, aliases?: string[]];

function tier(difficulty: Difficulty, category: string, entries: Entry[]): Prompt[] {
  return entries.map(([text, emoji, aliases]) => ({
    id: `${difficulty}:${category}:${text}`.toLowerCase().replace(/\s+/g, '-'),
    text,
    category,
    emoji,
    difficulty,
    ...(aliases ? { aliases } : {}),
  }));
}

/** A scene: shown as a sentence, got by naming every idea in it. */
function scene(category: string, text: string, emoji: string, keywords: string[][]): Prompt {
  return {
    id: `dhamaka:${category}:${text}`.toLowerCase().replace(/\s+/g, '-'),
    text,
    category,
    emoji,
    difficulty: 'dhamaka',
    keywords,
  };
}

const DOG = ['dog', 'doggy', 'puppy', 'kutta'];
const CAT = ['cat', 'kitten', 'billi'];
const CAR = ['car', 'gaadi'];
const ELEPHANT = ['elephant', 'hathi'];
const MONKEY = ['monkey', 'bandar'];
const ALIEN = ['alien', 'ufo'];
const TEACHER = ['teacher', 'sir', 'madam', 'professor'];
const WEDDING = ['wedding', 'shaadi', 'marriage'];
const CRICKET = ['cricket', 'cricketer', 'batsman'];

export const WORDS: Prompt[] = [
  // ── Easy ────────────────────────────────────────────────────────────────
  ...tier('easy', 'Objects', [
    ['Chair', '🪑'], ['Umbrella', '☂️', ['chhata']], ['Guitar', '🎸'], ['Laptop', '💻', ['computer']],
    ['Bicycle', '🚲', ['cycle', 'bike']], ['Clock', '🕒', ['watch']], ['Key', '🔑'], ['Book', '📖'],
    ['Phone', '📱', ['mobile', 'smartphone']], ['Glasses', '👓', ['spectacles', 'specs']], ['Scissors', '✂️'],
    ['Balloon', '🎈'], ['Candle', '🕯️'], ['Kite', '🪁', ['patang']], ['Bucket', '🪣', ['balti']],
  ]),
  ...tier('easy', 'Food', [
    ['Pizza', '🍕'], ['Burger', '🍔'], ['Banana', '🍌', ['kela']], ['Ice cream', '🍦', ['icecream']],
    ['Samosa', '🥟'], ['Apple', '🍎', ['seb']], ['Egg', '🥚', ['anda']], ['Watermelon', '🍉', ['tarbooz']],
    ['Tea', '🍵', ['chai']], ['Cake', '🎂'],
  ]),
  ...tier('easy', 'Animals', [
    ['Elephant', '🐘', ['hathi']], ['Monkey', '🐒', ['bandar']], ['Penguin', '🐧'], ['Tiger', '🐅', ['sher']],
    ['Fish', '🐟', ['machli']], ['Snake', '🐍', ['saanp']], ['Cow', '🐄', ['gaay']], ['Butterfly', '🦋'],
    ['Giraffe', '🦒'], ['Spider', '🕷️'],
  ]),
  ...tier('easy', 'Places', [
    ['Beach', '🏖️'], ['House', '🏠', ['home', 'ghar']], ['Mountain', '⛰️', ['pahad', 'hill']], ['Sun', '☀️', ['suraj']],
    ['Tree', '🌳', ['ped']],
  ]),

  // ── Medium ──────────────────────────────────────────────────────────────
  ...tier('medium', 'Food', [
    ['Pani puri', '🥙', ['golgappa', 'puchka', 'panipuri', 'gol gappa']], ['Biryani', '🍛'], ['Dosa', '🫓'],
    ['Jalebi', '🥨'], ['Popcorn', '🍿'], ['Noodles', '🍜', ['maggi', 'chowmein']], ['Vada pav', '🍔', ['vadapav']],
    ['Coconut', '🥥', ['nariyal']],
  ]),
  ...tier('medium', 'Places', [
    ['Airport', '✈️'], ['School', '🏫'], ['Railway station', '🚉', ['train station', 'station']],
    ['Hospital', '🏥'], ['Cinema', '🎬', ['movie theatre', 'theatre', 'theater']], ['Temple', '🛕', ['mandir']],
    ['Zoo', '🦓'], ['Swimming pool', '🏊', ['pool']], ['Lighthouse', '🗼'], ['Taj Mahal', '🕌', ['tajmahal']],
  ]),
  ...tier('medium', 'Actions', [
    ['Dancing', '💃', ['dance']], ['Sleeping', '😴', ['sleep']], ['Running', '🏃', ['run', 'jogging']],
    ['Cooking', '🍳', ['cook']], ['Swimming', '🏊', ['swim']], ['Crying', '😭', ['cry']], ['Fishing', '🎣'],
    ['Singing', '🎤', ['sing']], ['Sneezing', '🤧', ['sneeze']], ['Juggling', '🤹', ['juggle']],
  ]),
  ...tier('medium', 'People', [
    ['Teacher', '👩‍🏫'], ['Doctor', '🧑‍⚕️'], ['Police officer', '👮', ['police', 'policeman', 'cop']],
    ['Cricket player', '🏏', ['cricketer', 'batsman', 'batter']], ['Chef', '👨‍🍳', ['cook']],
    ['Astronaut', '🧑‍🚀'], ['Pirate', '🏴‍☠️'], ['Superhero', '🦸'],
  ]),
  ...tier('medium', 'Objects', [
    ['Auto rickshaw', '🛺', ['auto', 'rickshaw', 'tuk tuk']], ['Rocket', '🚀'], ['Helicopter', '🚁'],
    ['Traffic light', '🚦', ['signal']], ['Ceiling fan', '🌀', ['fan', 'pankha']], ['Pressure cooker', '♨️', ['cooker']],
    ['Headphones', '🎧', ['earphones']], ['Treasure chest', '💰', ['treasure']],
  ]),
  ...tier('medium', 'Animals', [
    ['Dinosaur', '🦖'], ['Octopus', '🐙'], ['Kangaroo', '🦘'], ['Peacock', '🦚', ['mor']], ['Camel', '🐪', ['oont']],
  ]),

  // ── Hard ────────────────────────────────────────────────────────────────
  ...tier('hard', 'Situations', [
    ['Traffic jam', '🚗'], ['Exam night', '📚', ['exam', 'studying']], ['First day at college', '🎒', ['first day', 'college']],
    ['Power cut', '🔌', ['blackout', 'no electricity']], ['Monday morning', '😩'], ['Birthday party', '🥳'],
    ['Job interview', '💼', ['interview']], ['Road trip', '🛣️'], ['Wedding', '💒', ['shaadi', 'marriage']],
    ['Selfie', '🤳'],
  ]),
  ...tier('hard', 'Ideas', [
    ['Gravity', '🍎'], ['Wi-Fi', '📶', ['wifi', 'internet']], ['Echo', '🔊'], ['Nightmare', '👹', ['bad dream']],
    ['Déjà vu', '🔁', ['deja vu']], ['Jet lag', '🌍', ['jetlag']], ['Time travel', '⌛'], ['Deadline', '⏰'],
    ['Hangover', '🥴'], ['Procrastination', '🛋️', ['procrastinating']],
  ]),
  ...tier('hard', 'Pop culture', [
    ['Bollywood', '🎬'], ['IPL', '🏆', ['indian premier league']], ['Diwali', '🪔', ['deepawali']], ['Holi', '🎨'],
    ['Instagram', '📸', ['insta']], ['Netflix', '📺'], ['Meme', '😹'], ['Emoji', '😀'],
    ['Spider-Man', '🕸️', ['spiderman', 'spider man']], ['Harry Potter', '🧙', ['harrypotter']],
  ]),
  ...tier('hard', 'Objects', [
    ['Mosquito net', '🦟', ['net', 'machardani']], ['Rubik\'s cube', '🧊', ['rubiks cube', 'rubik cube', 'cube']],
    ['Hourglass', '⏳'], ['Parachute', '🪂'], ['Chandelier', '💡'],
  ]),

  // ── Dhamaka ─ scenes and combos, worth the most ──────────────────────────
  scene('Scenes', 'Dog driving a car', '🐕', [DOG, CAR]),
  scene('Scenes', 'Cat stealing pizza', '🐈', [CAT, ['pizza']]),
  scene('Scenes', 'Teacher sleeping in class', '😴', [TEACHER, ['sleep', 'sleeping', 'asleep', 'nap']]),
  scene('Scenes', 'Alien ordering pani puri', '👽', [ALIEN, ['pani puri', 'panipuri', 'golgappa', 'puchka']]),
  scene('Scenes', 'Someone late for their own wedding', '⏰', [WEDDING, ['late']]),
  scene('Scenes', 'Elephant using a tiny umbrella', '☂️', [ELEPHANT, ['umbrella', 'chhata']]),
  scene('Scenes', 'Monkey stealing a samosa', '🐒', [MONKEY, ['samosa']]),
  scene('Scenes', 'Alien stuck in traffic', '🛸', [ALIEN, ['traffic', 'jam']]),
  scene('Scenes', 'Cricket player ordering pani puri', '🏏', [CRICKET, ['pani puri', 'panipuri', 'golgappa', 'puchka']]),
  scene('Scenes', 'Dinosaur at a wedding', '🦖', [['dinosaur', 'dino', 'trex'], WEDDING]),
  scene('Scenes', 'Man stuck in traffic', '🚦', [['man', 'guy', 'person', 'someone'], ['traffic', 'jam']]),
  scene('Scenes', 'Penguin on a beach', '🐧', [['penguin'], ['beach']]),
  scene('Scenes', 'Cow crossing the road', '🐄', [['cow', 'gaay'], ['road', 'street']]),
  scene('Scenes', 'Ghost taking a selfie', '👻', [['ghost', 'bhoot'], ['selfie']]),
  scene('Scenes', 'Robot making chai', '🤖', [['robot'], ['chai', 'tea']]),
  scene('Scenes', 'Shark in a swimming pool', '🦈', [['shark'], ['pool', 'swimming']]),
  scene('Scenes', 'Grandma riding a skateboard', '🛹', [['grandma', 'dadi', 'nani', 'old lady', 'granny'], ['skateboard', 'skating']]),
  scene('Scenes', 'Snowman in the desert', '⛄', [['snowman'], ['desert', 'sand']]),
  scene('Scenes', 'Tiger doing yoga', '🧘', [['tiger', 'sher'], ['yoga']]),
  scene('Scenes', 'Cat stealing a samosa from a sleeping policeman', '🥟', [CAT, ['samosa'], ['police', 'policeman', 'cop']]),
  scene('Combos', 'Dog + Rain', '🌧️', [DOG, ['rain', 'baarish', 'raining']]),
  scene('Combos', 'Elephant + Umbrella', '🐘', [ELEPHANT, ['umbrella', 'chhata']]),
  scene('Combos', 'Cricket + Wedding', '💍', [CRICKET, WEDDING]),
  scene('Combos', 'Alien + Auto rickshaw', '🛺', [ALIEN, ['auto', 'rickshaw']]),
  scene('Combos', 'Monkey + School', '🏫', [MONKEY, ['school', 'class']]),
  scene('Combos', 'Cat + Pizza', '🍕', [CAT, ['pizza']]),
];

export const wordsFor = (difficulty: Difficulty) =>
  WORDS.filter((prompt) => prompt.difficulty === difficulty);

/**
 * What the drawer's pick is worth, before speed and Dhamakas.
 *
 * Friend words sit between medium and hard: they are easy to draw for the group
 * that wrote them and impossible for anyone else, which is the point.
 */
export const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  easy: 1,
  medium: 1.25,
  friends: 1.35,
  hard: 1.5,
  dhamaka: 2,
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  friends: 'Friends',
  hard: 'Hard',
  dhamaka: 'Dhamaka',
};
