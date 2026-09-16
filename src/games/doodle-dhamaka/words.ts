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

  // A few more quick wins: familiar things that still make a satisfying
  // drawing when the clock is already making everybody panic.
  ...tier('easy', 'Objects', [
    ['Mug', '☕', ['cup']], ['Pillow', '🛏️'], ['Mirror', '🪞'], ['Camera', '📷'],
    ['Backpack', '🎒', ['bag']], ['Slipper', '🩴', ['chappal']], ['Remote control', '📺', ['remote']],
    ['Toothbrush', '🪥'], ['Bottle', '🍼', ['water bottle']], ['Spoon', '🥄'], ['Comb', '💇'],
    ['Alarm clock', '⏰', ['alarm']], ['Raincoat', '🧥'], ['Flashlight', '🔦'], ['Magnet', '🧲'],
    ['Teddy bear', '🧸', ['teddy']], ['Dice', '🎲'], ['Yo-yo', '🪀'], ['Ruler', '📏'],
  ]),
  ...tier('easy', 'Food', [
    ['Mango', '🥭', ['aam']], ['Orange', '🍊'], ['Grapes', '🍇'], ['Guava', '🍐', ['amrood']],
    ['Fries', '🍟', ['french fries']], ['Donut', '🍩'], ['Momos', '🥟', ['dumplings']],
    ['Lassi', '🥛'], ['Chaat', '🥗'], ['Gulab jamun', '🍩', ['gulabjamun']], ['Rasgulla', '⚪'],
    ['Paratha', '🫓'], ['Pancake', '🥞'], ['French toast', '🍞'], ['Chips', '🥔', ['crisps']],
  ]),
  ...tier('easy', 'Animals', [
    ['Dog', '🐶', ['puppy', 'kutta']], ['Cat', '🐱', ['kitten', 'billi']], ['Rabbit', '🐰', ['bunny']],
    ['Lion', '🦁', ['sher']], ['Horse', '🐴', ['ghoda']], ['Goat', '🐐', ['bakri']], ['Parrot', '🦜'],
    ['Crow', '🐦', ['kauwa']], ['Frog', '🐸', ['mendak']], ['Turtle', '🐢', ['kachua']],
    ['Panda', '🐼'], ['Rooster', '🐓', ['cock']], ['Whale', '🐋'], ['Crocodile', '🐊', ['magar']],
    ['Mosquito', '🦟', ['machhar']],
  ]),
  ...tier('easy', 'Places', [
    ['Park', '🌳'], ['Kitchen', '🍳'], ['Bathroom', '🛁'], ['Market', '🛒', ['bazaar']],
    ['Playground', '🛝'], ['Library', '📚'], ['Gym', '🏋️'], ['Rooftop', '🏙️', ['terrace']],
    ['Bus stop', '🚏'], ['Salon', '💇'], ['Dhaba', '🍽️'], ['Garden', '🌷'], ['Classroom', '🏫'],
    ['Metro', '🚇', ['metro train']],
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

  // Medium prompts are still immediately drawable, but give the table a
  // little more to argue about than a single noun.
  ...tier('medium', 'Food', [
    ['Chole bhature', '🍛', ['cholebature']], ['Pav bhaji', '🍞', ['pavbhaji']], ['Kathi roll', '🌯', ['kathiroll']],
    ['Filter coffee', '☕', ['south indian coffee']], ['Mango shake', '🥭', ['mango milkshake']],
    ['Poha', '🍚'], ['Pakora', '🥘', ['pakoda']], ['Kheer', '🍚'], ['Aloo paratha', '🫓'],
    ['Corn on the cob', '🌽', ['corn', 'bhutta']], ['Ice gola', '🍧', ['gola', 'gola candy']], ['Cupcake', '🧁'],
  ]),
  ...tier('medium', 'Places', [
    ['Metro station', '🚇', ['metro']], ['Dhaba', '🍽️'], ['Street market', '🛍️', ['market', 'bazaar']],
    ['Amusement park', '🎢', ['theme park']], ['Wedding hall', '💒', ['marriage hall']],
    ['Police station', '🚓'], ['Rooftop party', '🎉', ['terrace party']], ['Library', '📚'],
    ['Playground', '⚽', ['ground']], ['Gym', '🏋️'], ['Airport security', '🛂', ['security check']],
    ['Video game arcade', '🕹️', ['arcade']],
  ]),
  ...tier('medium', 'Actions', [
    ['Brushing teeth', '🪥', ['brush teeth']], ['Taking a selfie', '🤳', ['selfie']],
    ['Flying a kite', '🪁', ['fly kite']], ['Riding a scooter', '🛵', ['scooter']],
    ['Making a reel', '📱', ['reel', 'instagram reel']], ['Opening an umbrella', '☂️', ['open umbrella']],
    ['Missing a bus', '🚌', ['miss bus']], ['Losing your keys', '🔑', ['lost keys']],
    ['Bargaining', '🤝', ['bargain']], ['Reading a newspaper', '📰', ['newspaper']],
    ['Breaking a piñata', '🎊', ['pinata']], ['High-five', '🙌', ['high five']],
  ]),
  ...tier('medium', 'People', [
    ['Influencer', '📱', ['content creator']], ['Magician', '🎩', ['magic man']], ['Delivery person', '🛵', ['delivery boy']],
    ['Mechanic', '🔧'], ['Barber', '💈', ['hairdresser']], ['Farmer', '👨‍🌾', ['kisan']], ['Waiter', '🍽️'],
    ['DJ', '🎧'], ['Yoga teacher', '🧘', ['yoga instructor']], ['Security guard', '🛡️', ['guard']],
    ['News anchor', '🎙️', ['news reporter']], ['Street vendor', '🛒', ['vendor']],
  ]),
  ...tier('medium', 'Objects', [
    ['Scooter', '🛵', ['two wheeler']], ['Washing machine', '🧺'], ['Microwave', '📻'],
    ['Iron', '👔', ['iron box']], ['Tripod', '📸'], ['Cricket bat', '🏏', ['bat']],
    ['Drone', '🚁'], ['Alarm clock', '⏰', ['alarm']], ['Shopping cart', '🛒', ['trolley']],
    ['Earbuds', '🎧', ['airpods']], ['Power bank', '🔋', ['powerbank']], ['Ring light', '💡'],
  ]),
  ...tier('medium', 'Animals', [
    ['Sloth', '🦥'], ['Flamingo', '🦩'], ['Chameleon', '🦎'], ['Gorilla', '🦍'], ['Zebra', '🦓'],
    ['Hedgehog', '🦔'], ['Seahorse', '🐴'], ['Seal', '🦭'], ['Ostrich', '🪶'], ['Bat', '🦇'],
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

  ...tier('hard', 'Situations', [
    ['Wi-Fi stopped during a meeting', '📶', ['wifi', 'meeting']], ['Ordering food while on a diet', '🥗', ['food', 'diet']],
    ['Running for a bus', '🚌', ['run', 'bus']], ['Pretending to understand', '😅', ['understand', 'confused']],
    ['Awkward family photo', '📸', ['family', 'photo']], ['Forgotten password', '🔒', ['password', 'forgot']],
    ['Online meeting in pajamas', '💻', ['meeting', 'pajamas', 'pyjamas']], ['Neighbor\'s dog barking', '🐶', ['dog', 'barking']],
    ['Train platform changed', '🚉', ['train', 'platform']], ['Missing the last metro', '🚇', ['metro', 'miss']],
    ['Group project', '👥', ['project', 'team']], ['Queue at passport office', '🛂', ['queue', 'passport']],
    ['Trying to kill a mosquito', '🦟', ['mosquito', 'kill']], ['Bargaining with an auto driver', '🛺', ['bargain', 'auto']],
    ['Sneaking snacks into a cinema', '🍿', ['snacks', 'cinema']], ['Wedding dance practice', '💃', ['wedding', 'dance']],
  ]),
  ...tier('hard', 'Ideas', [
    ['FOMO', '😰', ['fear of missing out']], ['Small talk', '💬'], ['Awkward silence', '🤐', ['silence']],
    ['Overthinking', '🌀', ['think too much']], ['Viral moment', '🔥', ['viral']], ['Mood swing', '🎢', ['mood']],
    ['Brain freeze', '🥶', ['ice cream headache']], ['Lucky charm', '🍀', ['lucky']], ['Plot twist', '🔀'],
    ['Secret crush', '💘', ['crush']], ['Monday blues', '😩', ['monday']], ['Second-hand embarrassment', '🙈', ['embarrassed']],
    ['Free delivery', '🛵', ['delivery', 'free']], ['Password sharing', '🔑', ['password', 'share']], ['Low battery', '🔋', ['battery']],
  ]),
  ...tier('hard', 'Pop culture', [
    ['K-pop', '🎤', ['kpop']], ['Reality show', '📺', ['reality tv']], ['Viral dance', '💃', ['dance', 'viral']],
    ['Cricket final', '🏏', ['cricket', 'final']], ['Dance battle', '🕺', ['dance']], ['Karaoke', '🎤'],
    ['Stand-up comedy', '🎙️', ['comedy']], ['Red carpet', '🎬'], ['Fan theory', '🧠', ['theory']],
    ['Movie spoiler', '🍿', ['spoiler', 'movie']], ['Superstar', '⭐', ['star']], ['Music video', '🎵', ['song', 'video']],
    ['Reality show voting', '📱', ['vote', 'show']], ['Award ceremony', '🏆', ['awards']], ['Dance trend', '🕺', ['trend']],
  ]),
  ...tier('hard', 'Objects', [
    ['Selfie stick', '🤳'], ['Air fryer', '🍟'], ['Smartwatch', '⌚'], ['VR headset', '🥽', ['virtual reality']],
    ['Barcode scanner', '🔎', ['barcode']], ['Laptop charger', '🔌', ['charger']], ['Loudspeaker', '📢', ['speaker']],
    ['Magic wand', '🪄'], ['Green screen', '🟩'], ['Pigeon nest', '🐦', ['pigeon']],
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
  scene('Scenes', 'Cow riding a scooter', '🛵', [['cow', 'gaay'], ['scooter', 'bike']]),
  scene('Scenes', 'Grandma using Instagram', '📱', [['grandma', 'dadi', 'nani', 'granny'], ['instagram', 'insta', 'phone']]),
  scene('Scenes', 'Cat attending a video call', '🐱', [CAT, ['video call', 'zoom', 'laptop']]),
  scene('Scenes', 'Dog wearing sunglasses', '😎', [DOG, ['sunglasses', 'glasses']]),
  scene('Scenes', 'Elephant at a water park', '🐘', [ELEPHANT, ['water park', 'pool', 'slide']]),
  scene('Scenes', 'Monkey taking a selfie', '🤳', [MONKEY, ['selfie', 'phone']]),
  scene('Scenes', 'Alien eating biryani', '👽', [ALIEN, ['biryani']]),
  scene('Scenes', 'Teacher dancing at a wedding', '💃', [TEACHER, ['dance', 'dancing'], WEDDING]),
  scene('Scenes', 'Chef juggling samosas', '🥟', [['chef', 'cook'], ['juggle', 'juggling'], ['samosa']]),
  scene('Scenes', 'Police officer chasing a chicken', '🐔', [['police', 'policeman', 'cop'], ['chicken', 'hen']]),
  scene('Scenes', 'Robot stuck in a lift', '🤖', [['robot'], ['lift', 'elevator'], ['stuck']]),
  scene('Scenes', 'Ghost ordering pizza', '👻', [['ghost', 'bhoot'], ['pizza', 'order']]),
  scene('Scenes', 'Shark at the beach', '🦈', [['shark'], ['beach']]),
  scene('Scenes', 'Penguin cooking chai', '🐧', [['penguin'], ['chai', 'tea', 'cook']]),
  scene('Scenes', 'Dinosaur riding an auto', '🦖', [['dinosaur', 'dino', 'trex'], ['auto', 'rickshaw']]),
  scene('Scenes', 'Baby giving a speech', '👶', [['baby'], ['speech', 'talk', 'microphone']]),
  scene('Scenes', 'Bride chasing a runaway horse', '🐴', [['bride'], ['chase', 'chasing', 'run'], ['horse', 'ghoda']]),
  scene('Scenes', 'Auntie bargaining at a vegetable market', '🛒', [['auntie', 'woman', 'lady'], ['bargain', 'bargaining'], ['market', 'vegetable']]),
  scene('Scenes', 'Astronaut stuck in traffic', '🚀', [['astronaut'], ['traffic', 'jam']]),
  scene('Scenes', 'Cat playing cricket', '🏏', [CAT, ['cricket', 'bat']]),
  scene('Scenes', 'Dog doing yoga', '🧘', [DOG, ['yoga']]),
  scene('Scenes', 'Someone fighting a mosquito', '🦟', [['someone', 'person', 'man', 'woman'], ['fight', 'fighting'], ['mosquito', 'machhar']]),
  scene('Scenes', 'A student hiding from their teacher', '🙈', [['student', 'kid', 'child'], ['hide', 'hiding'], TEACHER]),
  scene('Combos', 'Dog + Rain', '🌧️', [DOG, ['rain', 'baarish', 'raining']]),
  scene('Combos', 'Elephant + Umbrella', '🐘', [ELEPHANT, ['umbrella', 'chhata']]),
  scene('Combos', 'Cricket + Wedding', '💍', [CRICKET, WEDDING]),
  scene('Combos', 'Alien + Auto rickshaw', '🛺', [ALIEN, ['auto', 'rickshaw']]),
  scene('Combos', 'Monkey + School', '🏫', [MONKEY, ['school', 'class']]),
  scene('Combos', 'Cat + Pizza', '🍕', [CAT, ['pizza']]),
  scene('Combos', 'Chai + Rain', '🌧️', [['chai', 'tea'], ['rain', 'baarish', 'raining']]),
  scene('Combos', 'Cricket + Samosa', '🏏', [['cricket', 'cricketer', 'bat'], ['samosa']]),
  scene('Combos', 'Wedding + Traffic', '🚗', [WEDDING, ['traffic', 'jam']]),
  scene('Combos', 'Dog + Laptop', '💻', [DOG, ['laptop', 'computer']]),
  scene('Combos', 'Cat + Keyboard', '⌨️', [CAT, ['keyboard', 'computer']]),
  scene('Combos', 'Alien + Chai', '👽', [ALIEN, ['chai', 'tea']]),
  scene('Combos', 'Elephant + Scooter', '🐘', [ELEPHANT, ['scooter', 'bike']]),
  scene('Combos', 'Monkey + Banana', '🍌', [MONKEY, ['banana', 'kela']]),
  scene('Combos', 'Teacher + Cricket', '🏏', [TEACHER, ['cricket', 'bat']]),
  scene('Combos', 'Grandma + Smartphone', '📱', [['grandma', 'dadi', 'nani', 'granny'], ['phone', 'smartphone', 'mobile']]),
  scene('Combos', 'Ghost + Selfie', '👻', [['ghost', 'bhoot'], ['selfie']]),
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
