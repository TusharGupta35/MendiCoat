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

export function GameHero({ game }: { game: Game }) {
  const cards = HERO_CARDS[game.id] ?? HERO_CARDS.MENDI_COAT;

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

          <HeroFan cards={cards} />
        </div>
      </div>
    </section>
  );
}
