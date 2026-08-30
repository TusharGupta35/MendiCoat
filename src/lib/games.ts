/**
 * Every game this app offers, live or promised.
 *
 * One list, read by the dashboard, so adding a game later is an entry here plus
 * its engine — not a new page and a new set of tiles. The order is the order
 * they appear; live games first.
 *
 * XP, levels, bands and titles are deliberately not per-game: a player has one
 * record across everything they play, and each game contributes to it.
 */

export type GameStatus = 'live' | 'soon';

export interface Game {
  id: string;
  /** Its own page: rules, rooms and everything else particular to this game. */
  slug: string;
  name: string;
  /** One line, said the way a player would describe it to a friend. */
  tagline: string;
  /** What actually happens in a round. Two or three sentences at most. */
  blurb: string;
  players: string;
  /** Whether a solo player can fill the empty seats. */
  bots: boolean;
  status: GameStatus;
  emblem: string;
  /** Tile accent. Written out in full because Tailwind reads class names, not variables. */
  accent: string;
}

export const GAMES: Game[] = [
  {
    id: 'MENDI_COAT',
    slug: 'mendi-coat',
    name: 'Mendi Coat',
    tagline: 'Four 10s decide it.',
    blurb:
      'Trick-taking in partners. Follow suit while you can; the first card that cannot sets trump for the rest of the hand. Take the tricks that carry the four 10s and the match is yours.',
    players: '4 players',
    bots: true,
    status: 'live',
    emblem: '🔟',
    accent: 'from-amber-400/20 to-amber-500/5 text-amber-300',
  },
  {
    id: 'CALLBREAK',
    slug: 'callbreak',
    name: 'Callbreak',
    tagline: 'Bid your tricks, then go and win them.',
    blurb:
      'Thirteen tricks, spades always trump. Before a card is played you call how many tricks you will take — hit the call and you score it, fall short and you lose it. No partners, five rounds, highest total wins.',
    players: '4 players',
    bots: false,
    status: 'soon',
    emblem: '♠️',
    accent: 'from-sky-400/20 to-sky-500/5 text-sky-300',
  },
  {
    id: 'IMPOSTOR',
    slug: 'impostor',
    name: 'Impostor',
    tagline: 'Everyone answers the question. One of you never saw it.',
    blurb:
      'Everybody gets the same question and answers it — except the impostor, who only sees the answers and has to invent one that fits. Then the table votes. Crew win by catching them; the impostor wins by surviving the vote.',
    players: '4–10 players',
    bots: true,
    status: 'soon',
    emblem: '🕵️',
    accent: 'from-violet-400/20 to-violet-500/5 text-violet-300',
  },
  {
    id: 'DOODLE_DHAMAKA',
    slug: 'doodle-dhamaka',
    name: 'Doodle Dhamaka',
    tagline: 'Draw it, guess it, wreck it.',
    blurb:
      'One player draws, everyone else races to guess — with a twist every round: draw left-handed, draw without lifting the pen, or draw while the rest shout wrong answers. Points for guessing fast and for being guessed fast.',
    players: '3–12 players',
    bots: false,
    status: 'soon',
    emblem: '🎨',
    accent: 'from-emerald-400/20 to-emerald-500/5 text-emerald-300',
  },
];

export const liveGames = () => GAMES.filter((game) => game.status === 'live');
export const comingSoon = () => GAMES.filter((game) => game.status === 'soon');
export const gameBySlug = (slug: string) => GAMES.find((game) => game.slug === slug);

/**
 * The game a room is playing.
 *
 * Rooms carry no game of their own yet — there is one playable game, so every
 * room is a table for it. When a second game ships, a room will name its own
 * and this constant is what the callers should stop using.
 */
export const ROOM_GAME = GAMES.find((game) => game.id === 'MENDI_COAT')!;
