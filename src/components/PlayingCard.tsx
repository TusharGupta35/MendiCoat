'use client';

import { useId } from 'react';
import type { Card, Suit } from '@/types/game';

const SUIT_GLYPH: Record<Suit, string> = {
  SPADES: '♠',
  HEARTS: '♥',
  CLUBS: '♣',
  DIAMONDS: '♦',
};

const SUIT_NAME: Record<Suit, string> = {
  SPADES: 'spades',
  HEARTS: 'hearts',
  CLUBS: 'clubs',
  DIAMONDS: 'diamonds',
};

/** Classic two-colour deck. Black is warmed slightly to sit in the plum theme. */
function suitInk(suit: Suit) {
  return suit === 'HEARTS' || suit === 'DIAMONDS' ? '#c2213a' : '#241a33';
}

/**
 * Pip positions per rank, in the card's 100x140 viewBox. `flipped` pips are
 * rotated 180° the way a real deck mirrors its lower half.
 */
type Pip = { x: number; y: number; flipped?: boolean };

const PIP_LAYOUTS: Record<string, Pip[]> = {
  '2': [{ x: 50, y: 44 }, { x: 50, y: 96, flipped: true }],
  '3': [{ x: 50, y: 44 }, { x: 50, y: 70 }, { x: 50, y: 96, flipped: true }],
  '4': [{ x: 36, y: 44 }, { x: 64, y: 44 }, { x: 36, y: 96, flipped: true }, { x: 64, y: 96, flipped: true }],
  '5': [{ x: 36, y: 44 }, { x: 64, y: 44 }, { x: 50, y: 70 }, { x: 36, y: 96, flipped: true }, { x: 64, y: 96, flipped: true }],
  '6': [{ x: 36, y: 44 }, { x: 64, y: 44 }, { x: 36, y: 70 }, { x: 64, y: 70 }, { x: 36, y: 96, flipped: true }, { x: 64, y: 96, flipped: true }],
  '7': [{ x: 36, y: 44 }, { x: 64, y: 44 }, { x: 50, y: 57 }, { x: 36, y: 70 }, { x: 64, y: 70 }, { x: 36, y: 96, flipped: true }, { x: 64, y: 96, flipped: true }],
  '8': [{ x: 36, y: 44 }, { x: 64, y: 44 }, { x: 50, y: 57 }, { x: 36, y: 70 }, { x: 64, y: 70 }, { x: 50, y: 83, flipped: true }, { x: 36, y: 96, flipped: true }, { x: 64, y: 96, flipped: true }],
  '9': [{ x: 36, y: 40 }, { x: 64, y: 40 }, { x: 36, y: 60 }, { x: 64, y: 60 }, { x: 50, y: 70 }, { x: 36, y: 80, flipped: true }, { x: 64, y: 80, flipped: true }, { x: 36, y: 100, flipped: true }, { x: 64, y: 100, flipped: true }],
  '10': [{ x: 36, y: 40 }, { x: 64, y: 40 }, { x: 50, y: 50 }, { x: 36, y: 60 }, { x: 64, y: 60 }, { x: 36, y: 80, flipped: true }, { x: 64, y: 80, flipped: true }, { x: 50, y: 90, flipped: true }, { x: 36, y: 100, flipped: true }, { x: 64, y: 100, flipped: true }],
};

/**
 * Court ornaments, drawn in a 40x28 box that gets translated into place: a
 * crown for the king, a gemmed tiara for the queen, a sword for the jack.
 * Cheap to draw, and reads instantly at table size — which a letter does not.
 */
const COURT_ORNAMENT: Record<string, string> = {
  K: 'M2 26 L6 6 L14 16 L20 3 L26 16 L34 6 L38 26 Z',
  Q: 'M3 26 Q8 9 14 18 Q20 3 26 18 Q32 9 37 26 Z',
  J: 'M20 1 L23.5 6.5 L23.5 17 L16.5 17 L16.5 6.5 Z M10 17 H30 V21 H10 Z M18 21 H22 V27.5 H18 Z',
};

interface PlayingCardProps {
  card: Card;
  /**
   * 'full' draws the real pip layout and court panel — use it wherever the card
   * is big enough to read (the player's hand). 'compact' drops to one large
   * centre glyph, which stays legible at the small size cards play at on the
   * table.
   */
  detail?: 'full' | 'compact';
  className?: string;
}

export function PlayingCard({ card, detail = 'full', className }: PlayingCardProps) {
  // Gradient ids must be unique per card or every card reuses the first one's.
  const gradientId = useId();
  const ink = suitInk(card.suit);
  const glyph = SUIT_GLYPH[card.suit];
  const isCourt = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
  const pips = PIP_LAYOUTS[card.rank];

  return (
    <svg
      viewBox="0 0 100 140"
      className={className}
      role="img"
      aria-label={`${card.rank} of ${SUIT_NAME[card.suit]}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#fffdf8" />
          <stop offset="55%" stopColor="#fbf7ee" />
          <stop offset="100%" stopColor="#efe7d7" />
        </linearGradient>
      </defs>

      {/* Face, plus an inner hairline that gives the paper some depth. */}
      <rect x="1.5" y="1.5" width="97" height="137" rx="9" fill={`url(#${gradientId})`} stroke="#cdc4b1" strokeWidth="1.5" />
      <rect x="6" y="6" width="88" height="128" rx="6" fill="none" stroke={ink} strokeOpacity="0.1" />

      {/* Corner indices, mirrored on the diagonal like a real deck. */}
      {[false, true].map((mirrored) => (
        <g
          key={String(mirrored)}
          fill={ink}
          transform={mirrored ? 'rotate(180 50 70)' : undefined}
          fontFamily="'Outfit', ui-sans-serif, sans-serif"
          fontWeight="700"
          textAnchor="middle"
        >
          <text x="13" y="25" fontSize={card.rank === '10' ? 15 : 17}>
            {card.rank}
          </text>
          <text x="13" y="38" fontSize="13">
            {glyph}
          </text>
        </g>
      ))}

      {isCourt ? (
        <g>
          {/* A tinted panel keeps the court cards visually distinct from pips. */}
          <rect x="28" y="32" width="44" height="76" rx="6" fill={ink} fillOpacity="0.06" stroke={ink} strokeOpacity="0.2" />
          <g transform="translate(35 39) scale(0.75)">
            <path d={COURT_ORNAMENT[card.rank]} fill={ink} fillOpacity="0.16" stroke={ink} strokeWidth="2.4" strokeLinejoin="round" />
            {card.rank === 'Q' ? <circle cx="20" cy="5" r="3.4" fill={ink} /> : null}
          </g>
          <text
            x="50"
            y="83"
            fill={ink}
            fontSize="30"
            fontWeight="700"
            textAnchor="middle"
            fontFamily="'Outfit', ui-sans-serif, sans-serif"
          >
            {card.rank}
          </text>
          <text x="50" y="101" fill={ink} fontSize="17" textAnchor="middle">
            {glyph}
          </text>
        </g>
      ) : detail === 'compact' || !pips ? (
        // Aces and every table-sized card: one big centre glyph.
        <text x="50" y="72" fill={ink} fontSize={card.rank === 'A' ? 54 : 46} textAnchor="middle" dominantBaseline="central">
          {glyph}
        </text>
      ) : (
        <g fill={ink}>
          {pips.map((pip, index) => (
            <text
              key={index}
              x={pip.x}
              y={pip.y}
              fontSize={card.rank === '9' || card.rank === '10' ? 18 : 20}
              textAnchor="middle"
              dominantBaseline="central"
              transform={pip.flipped ? `rotate(180 ${pip.x} ${pip.y})` : undefined}
            >
              {glyph}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}
