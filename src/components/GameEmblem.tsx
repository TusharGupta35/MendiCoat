import type { Game } from '@/lib/games';

/**
 * A drawn emblem per game, in place of an emoji.
 *
 * An emoji renders in the reader's system font, so it changes shape between a
 * Mac, a phone and Windows — and at tile size the four of them read as clip
 * art. These are drawn from each game's own material instead: the fan you hold
 * in Mendi Coat, the bid you call in Callbreak, the question only four of you
 * saw, the line someone is failing to draw.
 *
 * Two colours each, both from the app's palette, so the board stays gold on
 * purple however many games end up on it.
 */

const GOLD = '#ffc233';
const GOLD_DEEP = '#f5a615';
const CREAM = '#fff6da';
const INK = '#150c26';

function Cards() {
  // Three cards fanned from a common bottom edge, the front one face up.
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
      <g transform="translate(24 30)">
        <rect x="-9" y="-22" width="18" height="26" rx="3" fill={GOLD_DEEP} transform="rotate(-22)" />
        <rect x="-9" y="-22" width="18" height="26" rx="3" fill={GOLD} transform="rotate(-8)" />
        <rect x="-9" y="-23" width="18" height="27" rx="3" fill={CREAM} transform="rotate(8)" />
        <text
          x="0"
          y="-9"
          transform="rotate(8)"
          fill={INK}
          fontSize="15"
          textAnchor="middle"
          dominantBaseline="central"
        >
          ♠
        </text>
      </g>
    </svg>
  );
}

function Bid() {
  // A spade over a called number: the whole game is hitting the number.
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
      <circle cx="24" cy="24" r="17" fill={INK} opacity="0.35" />
      <text x="24" y="20" fill={CREAM} fontSize="20" textAnchor="middle" dominantBaseline="central">
        ♠
      </text>
      <rect x="14" y="31" width="20" height="3.5" rx="1.75" fill={GOLD} />
    </svg>
  );
}

function Question() {
  // A speech bubble with the question in it — and one seat that never saw it.
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
      <path
        d="M9 12a5 5 0 0 1 5-5h20a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5H22l-8 7v-7a5 5 0 0 1-5-5z"
        fill={CREAM}
      />
      <text x="24" y="19" fill={INK} fontSize="19" textAnchor="middle" dominantBaseline="central">
        ?
      </text>
    </svg>
  );
}

function Doodle() {
  // A drawn line with the nib still on it.
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
      <path
        d="M8 32c5-9 9 4 14-4s7 2 12-6"
        fill="none"
        stroke={CREAM}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M31 34l3-9 7 4-7 6z" fill={GOLD} />
      <path d="M31 34l2.2-1.6 1.6 2.6z" fill={INK} />
    </svg>
  );
}

const EMBLEMS: Record<string, () => React.ReactElement> = {
  MENDI_COAT: Cards,
  CALLBREAK: Bid,
  IMPOSTOR: Question,
  DOODLE_DHAMAKA: Doodle,
};

export function GameEmblem({
  game,
  size = 'md',
  className = '',
}: {
  game: Game;
  /** Tile-sized on the board, larger where the game is the page's subject. */
  size?: 'md' | 'lg';
  className?: string;
}) {
  const Drawn = EMBLEMS[game.id];
  const box = size === 'lg' ? 'h-16 w-16 p-3 text-3xl' : 'h-12 w-12 p-2.5 text-2xl';

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br transition duration-200 ${box} ${game.accent} ${className}`}
    >
      {/* A game added to the registry before it has an emblem drawn still gets
          a tile: it falls back to whatever the registry named. */}
      {Drawn ? <Drawn /> : game.emblem}
    </span>
  );
}
