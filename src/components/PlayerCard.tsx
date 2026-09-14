import { LevelAvatar } from '@/components/Avatar';
import { bandForLevel, type Level } from '@/lib/progression';
import type { CareerStats } from '@/lib/stats-core';

/**
 * Who you are, drawn as a card.
 *
 * The dashboard used to put this in the top-right corner of a bar: a name, a
 * title and a small face. Here it is the object the page is built around, so it
 * is made of the same material as the game — a gold foil edge, a hairline inner
 * frame, and rank pips in opposite corners carrying your LEVEL as the rank and
 * a spade as the suit, upside down at the far corner the way a real face card
 * does it.
 *
 * Because the pips state the level, the ring around the portrait deliberately
 * wears no number of its own (`badge={false}`): the ring is the progress
 * through the level, the pips are the level, and neither repeats the other.
 *
 * Below lg the card is laid on its side. Stacked, it was most of a phone's
 * first screen — pips, a fanned hand, a 158px portrait, the name, a ribbon and
 * a divider before a single number. Sideways it is the portrait beside the
 * name, title and level, then the bar and the three stats: the same card at
 * under half the height. Every change is a `max-lg:` override or a `lg:hidden`
 * element, so the desktop card is not altered by a single class.
 */

/** The band a level starts, so the card can name what is being climbed toward. */
function bandNameAt(startsAt: number) {
  return bandForLevel(startsAt).name;
}

/** The hand held up behind the portrait. Decorative, and marked as such. */
function Fan() {
  return (
    <svg
      viewBox="0 0 316 140"
      aria-hidden="true"
      className="pointer-events-none absolute -left-2 top-0 h-[140px] w-[calc(100%+1rem)] max-lg:hidden"
      preserveAspectRatio="xMidYMin meet"
    >
      <g opacity="0.6">
        <rect x="36" y="46" width="58" height="84" rx="6" fill="#3b2757" transform="rotate(-38 65 88)" />
        <rect x="222" y="46" width="58" height="84" rx="6" fill="#3b2757" transform="rotate(38 251 88)" />
        <rect x="72" y="34" width="58" height="84" rx="6" fill="#4d3373" transform="rotate(-23 101 76)" />
        <rect x="186" y="34" width="58" height="84" rx="6" fill="#4d3373" transform="rotate(23 215 76)" />
        <rect x="110" y="26" width="58" height="84" rx="6" fill="#63438f" transform="rotate(-9 139 68)" />
        <rect x="148" y="26" width="58" height="84" rx="6" fill="#63438f" transform="rotate(9 177 68)" />
      </g>
    </svg>
  );
}

function Pip({ level, inverted = false }: { level: number; inverted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex flex-col items-center gap-px ${inverted ? 'rotate-180' : ''}`}
    >
      <span className="font-display text-[21px] font-bold leading-none text-amber-300">{level}</span>
      <span className="text-base leading-none text-amber-300">♠</span>
    </span>
  );
}

function StatCell({ label, value, gold = false }: { label: string; value: string; gold?: boolean }) {
  return (
    <div
      className={`rounded-lg border px-1.5 py-2 text-center max-lg:py-1.5 ${
        gold ? 'border-amber-400/30 bg-amber-500/[0.09]' : 'border-amber-400/[0.08] bg-slate-950/60'
      }`}
    >
      <p className={`text-[19px] font-semibold tabular-nums max-lg:text-[17px] ${gold ? 'text-amber-300' : 'text-white'}`}>
        {value}
      </p>
      <p
        className={`text-[9px] font-medium uppercase tracking-[0.14em] ${
          gold ? 'text-amber-300/80' : 'text-slate-400'
        }`}
      >
        {label}
      </p>
    </div>
  );
}

export function PlayerCard({
  userId,
  name,
  avatar,
  photo,
  wearing,
  level,
  band,
  stats,
}: {
  userId: string;
  name: string;
  avatar: string | null;
  photo?: string | null;
  wearing: string | null;
  level: Level;
  band: { name: string; nextAt: number | null };
  stats: CareerStats;
}) {
  const toNext = band.nextAt === null ? null : band.nextAt - level.level;
  const nextBand = band.nextAt === null ? null : bandNameAt(band.nextAt);

  return (
    // The foil edge is a gradient behind a 3px inset, rather than a border:
    // a border cannot run gold-to-shadow-to-gold around a corner.
    <div className="rounded-[26px] bg-[linear-gradient(160deg,#ffe08a,#e0900c_38%,#7a4a06_62%,#ffd970)] p-[3px] shadow-[0_22px_50px_-26px_rgba(0,0,0,0.95)]">
      <div className="relative overflow-hidden rounded-[23px] bg-[#211539] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.26))] px-5 pb-5 pt-4 max-lg:px-4 max-lg:pb-4">
        {/* On its side the light moves with the portrait, from the top centre
            to behind the face at the left. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(88%_50%_at_50%_0%,rgba(245,166,21,0.24),transparent_64%)] max-lg:bg-[radial-gradient(55%_95%_at_14%_24%,rgba(245,166,21,0.26),transparent_66%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[9px] rounded-2xl border border-amber-300/20"
        />

        <div className="relative flex items-start justify-between max-lg:hidden">
          <Pip level={level.level} />
          <Pip level={level.level} inverted />
        </div>

        {/* On its side the card keeps one index, in the top-right corner, and
            upright: a single inverted pip only reads as upside down once its
            partner in the opposite corner is gone. */}
        <span className="absolute right-6 top-3.5 lg:hidden">
          <Pip level={level.level} />
        </span>

        {/* A plain block on desktop, where it adds nothing to the layout. Below
            lg it is the row that puts the portrait beside the name. */}
        <div className="max-lg:relative max-lg:flex max-lg:items-center max-lg:gap-4">
          <div className="relative -mt-1.5 h-[190px] max-lg:mt-0 max-lg:h-auto max-lg:shrink-0">
            <Fan />
            <div className="absolute left-1/2 top-[30px] -translate-x-1/2 max-lg:static max-lg:translate-x-0">
              <LevelAvatar
                avatar={avatar}
                userKey={userId}
                name={name}
                photo={photo}
                level={level.level}
                into={level.into}
                span={level.span}
                badge={false}
                className="h-[158px] w-[158px] max-lg:h-[84px] max-lg:w-[84px]"
              />
            </div>
          </div>

          <div className="max-lg:min-w-0 max-lg:flex-1 max-lg:pr-9">
            <h1 className="relative mt-1 truncate text-center text-3xl font-semibold text-white max-lg:mt-0 max-lg:text-left max-lg:text-2xl">
              {name}
            </h1>

            {/* The title is the one thing on this card you choose, so it is struck
                rather than typed: a gold ribbon with its tail cut. */}
            <div className="relative mt-2 flex justify-center max-lg:mt-1.5 max-lg:justify-start">
              {wearing ? (
                <span className="inline-flex items-center gap-1.5 border border-amber-200/75 bg-[linear-gradient(180deg,#ffe08a,#ffc233_48%,#e0900c)] px-5 pb-4 pt-1.5 text-[13px] font-bold max-lg:max-w-full max-lg:gap-1 max-lg:px-3 max-lg:pb-3 max-lg:pt-1 max-lg:text-[11px] text-amber-950 shadow-[0_5px_16px_-7px_rgba(245,166,21,0.9)] [clip-path:polygon(0_0,100%_0,100%_100%,50%_76%,0_100%)]">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true">
                    <path
                      d="M12 3l2.5 5.5 6 .8-4.3 4.1 1 6-5.2-2.8-5.2 2.8 1-6L3.5 9.3l6-.8z"
                      fill="currentColor"
                    />
                  </svg>
                  {wearing}
                </span>
              ) : (
                <span className="text-sm text-slate-500">No title yet</span>
              )}
            </div>

            {/* The band divider says this on desktop; on its side the card has no
                room for the divider, so the band is named here. The level is the
                corner pip's to state, as it is on desktop. */}
            <p className="relative mt-1.5 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300 lg:hidden">
              {band.name}
            </p>
          </div>
        </div>

        <div className="relative mt-3 flex items-center gap-2.5 max-lg:hidden">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-300/35" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300">
            {band.name}
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-amber-300/35 to-transparent" />
        </div>

        <div className="relative mt-3 max-lg:mt-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs tabular-nums text-slate-500">
              {level.into} / {level.span} XP
            </p>
            <p className="text-xs tabular-nums text-slate-500">
              {toNext === null ? 'Top band' : `${toNext} to ${nextBand}`}
            </p>
          </div>
          <div className="mt-1.5 h-[9px] overflow-hidden rounded-full bg-slate-950/90 shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#e0900c,#ffd970)] shadow-[0_0_14px_rgba(255,194,51,0.6)]"
              style={{
                width: `${Math.max(3, Math.min(100, Math.round((level.into / level.span) * 100)))}%`,
              }}
            />
          </div>
        </div>

        <div className="relative mt-[18px] grid grid-cols-3 gap-2 max-lg:mt-3">
          <StatCell label="Played" value={String(stats.played)} />
          <StatCell label="Win rate" value={`${stats.winRate}%`} />
          {/* The streak is the only number here that can move tonight, which is
              why it is the one wearing the gold. It counts wins in a row, not
              days — see careerStats in stats-core. */}
          <StatCell label="Win streak" value={String(stats.currentStreak)} gold />
        </div>
      </div>
    </div>
  );
}
