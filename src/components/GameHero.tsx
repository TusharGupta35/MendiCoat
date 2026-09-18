import type { CSSProperties } from 'react';
import { GameEmblem } from '@/components/GameEmblem';
import { PlayingCard } from '@/components/PlayingCard';
import { TableActions } from '@/components/TableActions';
import type { Game } from '@/games/registry';
import type { Card, Suit } from '@/types/game';

/**
 * A game's title screen.
 *
 * The top of the game page used to be a panel with a name in it, which made the
 * one page about a single game look like every other page. This is the game's
 * own cover: the player card's gold foil, the name set large in gold, and a fan
 * of the cards the game turns on, drawn with the real deck.
 *
 * Starting a table is the hero's one gold action. It is the same TableActions
 * the dashboard's tables panel carries, handed only this game, so on this page
 * it starts a table straight away rather than asking which game.
 */

const card = (rank: string, suit: Suit): Card => ({ rank, suit, code: `${rank}${suit[0]}` });

/**
 * The cards each game is about. Mendi Coat is decided by the four 10s; Teen Ki
 * Tigdi is named for the 3♠, the one card worth 30, so it sits in the middle of
 * the points that make up the rest of the deck's 250.
 */
const HERO_CARDS: Record<string, Card[]> = {
  MENDI_COAT: [card('10', 'SPADES'), card('10', 'HEARTS'), card('10', 'CLUBS'), card('10', 'DIAMONDS')],
  TEEN_KI_TIGDI: [
    card('A', 'SPADES'),
    card('5', 'HEARTS'),
    card('3', 'SPADES'),
    card('10', 'DIAMONDS'),
    card('K', 'CLUBS'),
  ],
};

/**
 * The fan, over light rays.
 *
 * Every offset is written at desktop size and multiplied by --s, which is about
 * half on a phone: there the fan tucks into the hero's top-right corner beside
 * the name instead of taking a column of its own.
 */
function HeroFan({ cards }: { cards: Card[] }) {
  const count = cards.length;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-1 top-2 h-[110px] w-[150px] [--s:0.52] sm:right-4 lg:relative lg:right-auto lg:top-auto lg:h-[200px] lg:w-auto lg:[--s:1]"
    >
      <div
        className="absolute left-1/2 top-1/2 h-[240px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full lg:h-[400px] lg:w-[400px]"
        style={{
          backgroundImage:
            'repeating-conic-gradient(from 0deg, rgba(255,207,90,0.16) 0deg 7deg, transparent 7deg 22deg)',
          maskImage: 'radial-gradient(circle, #000 18%, transparent 66%)',
          WebkitMaskImage: 'radial-gradient(circle, #000 18%, transparent 66%)',
        }}
      />
      <div className="absolute inset-x-[14%] bottom-[4%] h-[16%] rounded-[50%] bg-black/30 blur-md max-lg:hidden" />
      {cards.map((entry, index) => {
        // Spread evenly around the middle card, tipped outwards and dipping at
        // the ends the way a held hand does.
        const t = index - (count - 1) / 2;
        const x = t * (176 / count);
        const y = t * t * 6 - 4;
        const rotate = t * (48 / count);
        return (
          <div
            key={entry.code}
            className="absolute left-1/2 top-1/2"
            style={
              {
                width: 'calc(84px * var(--s))',
                height: 'calc(118px * var(--s))',
                transform: `translate(-50%, -50%) translate(calc(${x}px * var(--s)), calc(${y}px * var(--s))) rotate(${rotate}deg)`,
              } as CSSProperties
            }
          >
            <PlayingCard
              card={entry}
              detail="compact"
              className="h-full w-full drop-shadow-[0_8px_14px_rgba(0,0,0,0.55)]"
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Doodle Dhamaka is about a shared canvas, not a hand of cards. The hero gets
 * its own little snapshot of the game: a messy drawing in progress, a pencil,
 * and the kind of reaction bubbles that make the table noisy.
 */
function DoodleHeroArt() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-[-10px] top-2 h-[110px] w-[170px] sm:right-4 sm:h-[150px] sm:w-[280px] lg:relative lg:right-auto lg:top-auto lg:h-[200px] lg:w-auto"
    >
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.24),transparent_68%)] blur-xl" />
      <svg viewBox="0 0 420 200" className="relative h-full w-full overflow-visible">
        <defs>
          <linearGradient id="doodle-paper" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fffdf4" />
            <stop offset="1" stopColor="#f6e8c5" />
          </linearGradient>
          <linearGradient id="doodle-pencil" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fde68a" />
            <stop offset="0.45" stopColor="#f59e0b" />
            <stop offset="1" stopColor="#c2410c" />
          </linearGradient>
          <filter id="doodle-shadow" x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#05020b" floodOpacity="0.48" />
          </filter>
        </defs>

        <g transform="rotate(-4 210 105)" filter="url(#doodle-shadow)">
          <rect x="57" y="22" width="306" height="153" rx="17" fill="url(#doodle-paper)" />
          <rect x="65" y="30" width="290" height="137" rx="11" fill="none" stroke="#d9b979" strokeDasharray="4 6" strokeWidth="2" />

          {/* A deliberately imperfect doodle: sun, hill, house and a guessing mark. */}
          <path d="M89 72c7-15 15-15 22 0m-30-2h37m-19-21v39" fill="none" stroke="#f59e0b" strokeLinecap="round" strokeWidth="4" />
          <path d="M91 139c30-34 51-24 73-46 20-20 35-18 53-2 20 18 35 13 61-12" fill="none" stroke="#10b981" strokeLinecap="round" strokeWidth="5" />
          <path d="m190 131 31-36 37 36z" fill="#fda4af" fillOpacity="0.7" stroke="#be185d" strokeLinejoin="round" strokeWidth="3" />
          <path d="M205 131v-20h13v20m17-1v-12h10v12" fill="none" stroke="#831843" strokeLinecap="round" strokeWidth="3" />
          <path d="M178 95 208 69l29 26" fill="none" stroke="#be185d" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
          <path d="M276 126c10-14 22-14 31 0-8 10-20 10-31 0z" fill="#60a5fa" fillOpacity="0.65" stroke="#1d4ed8" strokeWidth="3" />
          <circle cx="293" cy="121" r="3" fill="#1d4ed8" />
          <path d="M276 126c7 5 18 5 31 0" fill="none" stroke="#1d4ed8" strokeLinecap="round" strokeWidth="2" />

          <g className="doodle-hero-dash">
            <path d="m111 47 5-8m14 13 8-5m-3 17 9 1" stroke="#f43f5e" strokeLinecap="round" strokeWidth="3" />
            <circle cx="121" cy="51" r="13" fill="#fef3c7" stroke="#f59e0b" strokeWidth="2" />
            <path d="M116 51h10m-5-5v10" stroke="#f59e0b" strokeLinecap="round" strokeWidth="2" />
          </g>
        </g>

        {/* The pencil sits over the edge of the canvas, as if the drawer just let go. */}
        <g transform="translate(296 135)">
          <g className="doodle-hero-pencil" transform="rotate(27)">
            <path d="m0 10 15-15 83 0v30H15z" fill="url(#doodle-pencil)" />
            <path d="m0 10 15-15 0 30z" fill="#f4d4a2" />
            <path d="m0 10 8-3v6z" fill="#1f2937" />
            <path d="M31-5v30m17-30v30m17-30v30" stroke="#fde68a" strokeOpacity="0.55" strokeWidth="3" />
            <path d="M98-5h10v30H98z" fill="#ef4444" />
          </g>
        </g>

        <g className="doodle-hero-bubble">
          <rect x="13" y="123" width="76" height="32" rx="16" fill="#150c26" fillOpacity="0.82" stroke="#fbbf24" strokeOpacity="0.75" />
          <text x="51" y="144" fill="#fff6da" fontSize="12" fontWeight="800" letterSpacing="1.5" textAnchor="middle">GUESS!</text>
        </g>
        <g className="doodle-hero-bubble doodle-hero-bubble-late">
          <rect x="326" y="25" width="75" height="32" rx="16" fill="#150c26" fillOpacity="0.82" stroke="#34d399" strokeOpacity="0.8" />
          <text x="363.5" y="46" fill="#a7f3d0" fontSize="12" fontWeight="800" letterSpacing="1.5" textAnchor="middle">DING!</text>
        </g>
      </svg>
    </div>
  );
}

/**
 * Impostor is not about cards either. Its hero is the moment the game turns
 * on: the same question in three hands, and a fourth holding nothing but a
 * question mark.
 *
 * Drawn rather than photographed from the game so it reads at phone size — the
 * three gold cards are identical on purpose, because the whole point is that
 * the rose one is the odd card out and its holder does not know what the others
 * are looking at.
 */
function ImpostorHeroArt() {
  const asked = [
    { x: 24, tilt: -9 },
    { x: 130, tilt: -3 },
    { x: 236, tilt: 3 },
  ];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-[-10px] top-2 h-[110px] w-[170px] sm:right-4 sm:h-[150px] sm:w-[280px] lg:relative lg:right-auto lg:top-auto lg:h-[200px] lg:w-auto"
    >
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(244,63,94,0.2),transparent_68%)] blur-xl" />
      <svg viewBox="0 0 420 200" className="relative h-full w-full overflow-visible">
        <defs>
          <linearGradient id="imp-known" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff6da" />
            <stop offset="1" stopColor="#ffd970" />
          </linearGradient>
          <linearGradient id="imp-blind" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fda4af" />
            <stop offset="1" stopColor="#f43f5e" />
          </linearGradient>
          <filter id="imp-shadow" x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="9" stdDeviation="7" floodColor="#05020b" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* The three who saw it. Same card, same lines, three times. */}
        {asked.map((seat) => (
          <g key={seat.x} transform={`rotate(${seat.tilt} ${seat.x + 55} 110)`} filter="url(#imp-shadow)">
            <rect x={seat.x} y="42" width="110" height="136" rx="14" fill="url(#imp-known)" />
            <rect
              x={seat.x + 8}
              y="50"
              width="94"
              height="120"
              rx="9"
              fill="none"
              stroke="#e0900c"
              strokeOpacity="0.45"
              strokeWidth="2"
            />
            <path
              d={`M${seat.x + 22} 84h66M${seat.x + 22} 102h66M${seat.x + 22} 120h44`}
              stroke="#b8791a"
              strokeLinecap="round"
              strokeOpacity="0.75"
              strokeWidth="6"
            />
          </g>
        ))}

        {/* The one who did not, held a little higher so the eye lands on it. */}
        <g transform="rotate(9 397 100)" filter="url(#imp-shadow)">
          <rect x="342" y="32" width="110" height="136" rx="14" fill="url(#imp-blind)" />
          <rect
            x="350"
            y="40"
            width="94"
            height="120"
            rx="9"
            fill="none"
            stroke="#9f1239"
            strokeOpacity="0.5"
            strokeWidth="2"
          />
          <text
            x="397"
            y="104"
            fill="#4c0519"
            fontSize="76"
            fontWeight="800"
            textAnchor="middle"
            dominantBaseline="central"
          >
            ?
          </text>
        </g>
      </svg>
    </div>
  );
}

/** Each game's cover art, falling back to a fan of the cards it turns on. */
const HERO_ART: Record<string, () => React.ReactElement> = {
  DOODLE_DHAMAKA: DoodleHeroArt,
  IMPOSTOR: ImpostorHeroArt,
};

function HeroVisual({ game }: { game: Game }) {
  const Art = HERO_ART[game.id];
  return Art ? <Art /> : <HeroFan cards={HERO_CARDS[game.id] ?? HERO_CARDS.MENDI_COAT} />;
}

export function GameHero({ game }: { game: Game }) {
  return (
    <section className="rounded-[22px] bg-[linear-gradient(160deg,#ffe08a,#e0900c_38%,#7a4a06_62%,#ffd970)] p-[3px] shadow-[0_22px_50px_-26px_rgba(0,0,0,0.95)] sm:rounded-[26px]">
      <div className="relative overflow-hidden rounded-[19px] bg-[#211539] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.26))] p-4 sm:rounded-[23px] sm:px-8 sm:py-6">
        {/* Felt light where the cards are, table gold where the name is. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_80%_at_100%_30%,rgba(18,112,74,0.6),transparent_70%),radial-gradient(70%_70%_at_0%_0%,rgba(245,166,21,0.22),transparent_60%)] lg:bg-[radial-gradient(45%_110%_at_84%_50%,rgba(18,112,74,0.55),transparent_72%),radial-gradient(60%_90%_at_12%_0%,rgba(245,166,21,0.22),transparent_60%)]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[7px] rounded-[14px] border border-amber-300/20 sm:inset-[9px] sm:rounded-[17px]"
        />

        <div className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0">
            <div className="flex items-center gap-3.5">
              <GameEmblem game={game} size="lg" className="max-sm:hidden" />
              {/* On a phone the name keeps clear of the fan in the corner. */}
              <div className="min-w-0 max-sm:max-w-[210px]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 max-sm:flex-col-reverse max-sm:items-start">
                  <h1
                    className="bg-[linear-gradient(180deg,#fff6da_0%,#ffd970_45%,#e0900c_100%)] bg-clip-text font-display text-[38px] font-extrabold leading-none tracking-[-0.01em] text-transparent drop-shadow-[0_3px_16px_rgba(245,166,21,0.35)] sm:text-[58px]"
                    // globals.css gives every h1 a text-shadow, and on
                    // transparent, gradient-clipped text it smears over the gold.
                    style={{ textShadow: 'none' }}
                  >
                    {game.name}
                  </h1>
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300 sm:text-[11px]">
                    Playable
                  </span>
                </div>
                <p className="mt-1 font-display text-[17px] font-semibold leading-snug text-amber-300 sm:text-xl">
                  {game.tagline}{' '}
                  <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400 max-sm:mt-1 max-sm:block sm:ml-1.5 sm:text-[11px] sm:align-middle">
                    {game.players}
                    {game.bots ? ' · bots available' : ''}
                  </span>
                </p>
              </div>
            </div>

            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-slate-300 max-sm:line-clamp-3 sm:text-sm">
              {game.blurb}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="w-full sm:w-auto">
                <TableActions games={[game]} />
              </div>
              {game.bots ? (
                <span className="text-[13px] text-slate-500 max-sm:hidden">Bots fill any empty seat</span>
              ) : null}
            </div>
          </div>

          <HeroVisual game={game} />
        </div>
      </div>
    </section>
  );
}
