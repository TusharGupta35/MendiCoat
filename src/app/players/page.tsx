import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { Avatar, LevelAvatar } from '@/components/Avatar';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { exactly, timeSince } from '@/lib/relative-time';
import { levelFromXp } from '@/lib/progression';
import { getXpLeaderboard, type XpRow } from '@/lib/stats';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Everybody who has played here, in level order.
 *
 * The dashboard board is the top five, which is the wrong list for "how am I
 * doing against everyone" — this is that list, and every row opens the player
 * behind it.
 *
 * The top three lift out as a podium above the list. As one flat column the
 * thing the page is actually about — who is winning — had to be read rather
 * than seen.
 */

/**
 * The three metals, as the stock each place is printed on.
 *
 * The podium is the one screen in the app that is a result rather than a
 * record, so it is drawn like one: a medal hung from a ribbon, light turning
 * behind the face, a glint crossing the foil and the level struck on a
 * hexagon. Gold is warmest, has the largest face and is the only one crowned;
 * silver and bronze are visibly a step down before a single number is read.
 *
 * `stops` feed the SVG gradients (medal, hexagon), which cannot read a CSS
 * gradient string.
 */
const PODIUM = [
  {
    foil: 'linear-gradient(160deg,#ffe08a,#e0900c 38%,#7a4a06 62%,#ffd970)',
    stops: ['#fff1b8', '#ffc233', '#9a5c07'],
    glow: 'rgba(245,166,21,0.3)',
    ray: 'rgba(255,207,90,0.2)',
    ink: '#3d2604',
    level: 'text-amber-300',
    shineDelay: '0s',
  },
  {
    foil: 'linear-gradient(160deg,#f2f6fb,#9aa7b8 38%,#46505f 62%,#e4ebf4)',
    stops: ['#ffffff', '#b8c3d1', '#566273'],
    glow: 'rgba(203,213,225,0.18)',
    ray: 'rgba(226,232,240,0.12)',
    ink: '#1f2937',
    level: 'text-slate-100',
    shineDelay: '1.8s',
  },
  {
    foil: 'linear-gradient(160deg,#f3c9a2,#c98b52 38%,#6b3f1c 62%,#eab387)',
    stops: ['#f8d9bb', '#c98b52', '#6b3f1c'],
    glow: 'rgba(201,139,82,0.22)',
    ray: 'rgba(234,179,135,0.12)',
    ink: '#2a1608',
    level: 'text-[#eab387]',
    shineDelay: '3.6s',
  },
] as const;

type Metal = (typeof PODIUM)[number];

/** A metal as an SVG gradient, keyed by place so the three never share an id. */
function MetalGradient({ id, metal }: { id: string; metal: Metal }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor={metal.stops[0]} />
      <stop offset="0.5" stopColor={metal.stops[1]} />
      <stop offset="1" stopColor={metal.stops[2]} />
    </linearGradient>
  );
}

/** The place, as a medal hanging from a ribbon that runs off the card's top. */
function Medal({ place, metal }: { place: 1 | 2 | 3; metal: Metal }) {
  const id = `podium-medal-${place}`;
  return (
    <svg
      viewBox="0 0 44 50"
      aria-hidden="true"
      className="h-[50px] w-11 drop-shadow-[0_6px_10px_rgba(0,0,0,0.55)] max-sm:h-9 max-sm:w-8"
    >
      <defs>
        <MetalGradient id={id} metal={metal} />
      </defs>
      <path d="M6 0h11l10 21H16z" fill="#b4233c" />
      <path d="M38 0H27L17 21h11z" fill="#dc3a55" />
      <path d="M11.5 0h1.8l9.2 19.5h-1.8z" fill="#ffd970" opacity="0.7" />
      <circle cx="22" cy="33" r="15" fill={`url(#${id})`} />
      <circle cx="22" cy="33" r="11.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      <text
        x="22"
        y="38.5"
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill={metal.ink}
        className="font-display"
      >
        {place}
      </text>
    </svg>
  );
}

/** Worn by first place only, tipped on the corner of the portrait. */
function Crown() {
  return (
    <svg
      viewBox="0 0 40 30"
      aria-hidden="true"
      className="animate-podium-crown absolute -right-3 -top-4 z-10 w-10 rotate-[14deg] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] max-sm:-right-2 max-sm:-top-3 max-sm:w-7"
    >
      <defs>
        <linearGradient id="podium-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.55" stopColor="#ffc233" />
          <stop offset="1" stopColor="#b86e08" />
        </linearGradient>
      </defs>
      <path
        d="M3 10l8.5 7L20 3l8.5 14L37 10l-3.5 15h-27z"
        fill="url(#podium-crown)"
        stroke="#7a4a06"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <rect x="6.5" y="23" width="27" height="4.5" rx="1.2" fill="#e0900c" stroke="#7a4a06" strokeWidth="1" />
      <circle cx="20" cy="17.5" r="2.4" fill="#ef4444" />
      <circle cx="11.8" cy="20" r="1.6" fill="#38bdf8" />
      <circle cx="28.2" cy="20" r="1.6" fill="#38bdf8" />
      <circle cx="3" cy="10" r="1.9" fill="#fff1b8" />
      <circle cx="20" cy="3" r="2.1" fill="#fff1b8" />
      <circle cx="37" cy="10" r="1.9" fill="#fff1b8" />
    </svg>
  );
}

/** The level, struck on a hexagon in the place's metal. */
function LevelBadge({ level, place, metal }: { level: number; place: 1 | 2 | 3; metal: Metal }) {
  const id = `podium-hex-${place}`;
  return (
    <span
      role="img"
      aria-label={`Level ${level}`}
      className="relative inline-flex h-[54px] w-12 items-center justify-center max-sm:h-9 max-sm:w-8"
    >
      <svg
        viewBox="0 0 48 54"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
      >
        <defs>
          <MetalGradient id={id} metal={metal} />
        </defs>
        <path d="M24 2.5l19.5 11.25v26.5L24 51.5 4.5 40.25v-26.5z" fill="#1a1030" stroke={`url(#${id})`} strokeWidth="3" strokeLinejoin="round" />
        <path d="M24 9l14 8.1v19.8L24 45 10 36.9V17.1z" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      </svg>
      <span
        className={`relative font-display text-[22px] font-bold leading-none tabular-nums max-sm:text-sm ${metal.level}`}
      >
        {level}
      </span>
    </span>
  );
}

/** One number under the podium portrait, in the player card's own vocabulary. */
function Cell({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/20 px-1.5 py-2 text-center">
      <p className={`text-[15px] font-semibold tabular-nums ${tint ?? 'text-white'}`}>{value}</p>
      <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
    </div>
  );
}

function PodiumCard({
  row,
  place,
  isMe,
  gap,
}: {
  row: XpRow;
  place: 1 | 2 | 3;
  isMe: boolean;
  /**
   * XP between this player and the one above — or for first place, the lead
   * over second. The point of a board is the distance to the next rung, and
   * it costs nothing: the rows are already sorted and loaded.
   */
  gap: number;
}) {
  const metal = PODIUM[place - 1];
  // The row carries the level but not the progress through it. Recomputing is
  // a pure function over XP already in hand, so the ring costs no query.
  const level = levelFromXp(row.totalXp);
  const leads = place === 1;

  // Phone changes are `max-sm:` overrides throughout.
  return (
    <Link
      href={`/players/${row.userId}`}
      className="group block rounded-[22px] p-[2px] shadow-[0_22px_50px_-26px_rgba(0,0,0,0.95)] transition duration-200 hover:-translate-y-1.5 motion-reduce:transform-none max-sm:rounded-[18px]"
      style={{ backgroundImage: metal.foil }}
    >
      <div
        className={`relative overflow-hidden rounded-[20px] bg-[#211539] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.3))] px-4 pb-4 pt-4 sm:px-5 sm:pb-5 max-sm:rounded-[16px] max-sm:px-1.5 max-sm:pb-3 max-sm:pt-2.5 ${
          isMe ? 'ring-1 ring-inset ring-amber-300/40' : ''
        }`}
      >
        {/* Lit from above in its own metal, over the table's suit motif. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: `radial-gradient(92% 58% at 50% -6%, ${metal.glow}, transparent 66%)` }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ backgroundImage: 'var(--suit-tile)', backgroundSize: '150px 150px' }}
        />
        {/* A glint across the foil every few seconds, staggered so the three
            never flash together. */}
        <span
          aria-hidden="true"
          className="animate-podium-shine pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/[0.14] to-transparent"
          style={{ animationDelay: metal.shineDelay }}
        />
        {/* A hairline inside the foil, the way the player card is framed. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[6px] rounded-[15px] border border-white/[0.07] max-sm:inset-[4px] max-sm:rounded-[12px]"
        />

        <div className="relative flex flex-col items-center text-center">
          {/* Hung from the top edge: the ribbon starts where the card does.
              Everything in this column but the portrait sits at z-[1]: the
              rays behind the face are positioned and two faces wide, and a
              positioned layer would otherwise paint over in-flow text. */}
          <div className="relative z-[1] -mt-4 max-sm:-mt-2.5">
            <Medal place={place} metal={metal} />
          </div>

          <div className="relative mt-2 max-sm:mt-1">
            {/* Light turning behind the face. Only the winner's moves. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-[230%] w-[230%] -translate-x-1/2 -translate-y-1/2"
            >
              <span
                className={`block h-full w-full rounded-full ${leads ? 'animate-podium-rays' : ''}`}
                style={{
                  backgroundImage: `repeating-conic-gradient(from 0deg, ${metal.ray} 0deg 7deg, transparent 7deg 22deg)`,
                  maskImage: 'radial-gradient(circle, black 20%, transparent 66%)',
                  WebkitMaskImage: 'radial-gradient(circle, black 20%, transparent 66%)',
                }}
              />
            </span>

            {/* The ring is the progress through the level; the hexagon below
                is the level. Neither repeats the other, which is why the
                portrait wears no badge. */}
            <LevelAvatar
              avatar={row.avatar}
              userKey={row.userId}
              name={row.name}
              photo={row.image}
              level={level.level}
              into={level.into}
              span={level.span}
              badge={false}
              className={`transition duration-200 group-hover:scale-[1.05] motion-reduce:transform-none ${
                // The winner's face is the larger one on every screen.
                leads
                  ? 'h-[92px] w-[92px] max-sm:h-16 max-sm:w-16'
                  : 'h-[78px] w-[78px] max-sm:h-[52px] max-sm:w-[52px]'
              }`}
            />
            {leads ? <Crown /> : null}
          </div>

          <p className="relative z-[1] mt-3 max-w-full truncate text-xl font-semibold text-white max-sm:mt-1.5 max-sm:text-sm">
            {row.name}
            {isMe ? <span className="text-xs font-medium text-amber-300 max-sm:hidden"> · you</span> : null}
          </p>
          <p className="relative z-[1] mt-0.5 text-xs text-slate-400 max-sm:hidden" title={exactly(row.lastPlayed)}>
            {row.band} · {timeSince(row.lastPlayed) ?? 'no matches yet'}
          </p>

          <div className="relative z-[1] mt-3 flex items-center gap-3 max-sm:mt-1.5">
            <LevelBadge level={row.level} place={place} metal={metal} />
            <div className="text-left max-sm:hidden">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Level
              </p>
              <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                {level.into.toLocaleString()} / {level.span.toLocaleString()} XP
              </p>
            </div>
          </div>

          {/* Three cells across a card a third of a phone wide do not fit, so
              on a phone the card keeps the one number the board below cannot
              tell you at a glance: the distance to the next rung. */}
          <p
            className={`relative z-[1] mt-1 text-[10px] font-semibold tabular-nums sm:hidden ${
              gap === 0 ? 'text-slate-400' : leads ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {gap === 0 ? 'level' : leads ? `+${gap.toLocaleString()} XP` : `−${gap.toLocaleString()} XP`}
          </p>

          <div className="relative z-[1] mt-4 grid w-full grid-cols-3 gap-1.5 max-sm:hidden">
            <Cell label="Total XP" value={row.totalXp.toLocaleString()} tint={metal.level} />
            <Cell label={row.played === 1 ? 'Match' : 'Matches'} value={String(row.played)} />
            <Cell
              label={leads ? 'XP lead' : 'XP behind'}
              value={gap === 0 ? 'level' : gap.toLocaleString()}
              tint={gap === 0 ? 'text-slate-300' : leads ? 'text-emerald-300' : 'text-rose-300'}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default async function PlayersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const [me, players] = await Promise.all([
    prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }),
    // Everyone, not a page of them: this is five friends and their guests, and
    // a list that never needs a second page should not have one.
    getXpLeaderboard(100),
  ]);

  const podium = players.slice(0, 3);

  return (
    <main className="min-h-screen bg-slate-950 px-3 pb-10 pt-4 text-slate-100 sm:px-6 sm:pb-12 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-5 max-sm:gap-4">
        <AppHeader variant="slim" current="players" />

        {/* On a phone the title is a line, not a panel. As a panel it was the
            biggest thing above the podium and pulled the eye off the cards the
            page is for. It cannot simply lose its chrome with a class — the
            theme repaints bg-slate-900/80 outside Tailwind's layers — so the
            phone gets its own heading and the panel is hidden there. */}
        <div className="flex items-baseline justify-between gap-3 px-1 sm:hidden">
          <h1 className="text-2xl font-semibold text-white">Players</h1>
          <p className="text-[13px] tabular-nums text-slate-400">
            {players.length} ranked by XP
          </p>
        </div>

        <header className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 max-sm:hidden">
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-amber-400">Players</p>
          <h1 className="mt-1.5 text-3xl font-semibold text-white sm:text-4xl">
            Everyone at the table
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Ranked by XP, which every game pays into. {players.length}{' '}
            {players.length === 1 ? 'player has' : 'players have'} finished a match here.
          </p>
        </header>

        {players.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6">
            <p className="text-sm text-slate-400">
              Nobody has finished a match yet. Play one and this list starts with you.
            </p>
          </div>
        ) : (
          <>
            {/* Second place sits left of first, the way a podium is built, and
                the middle column is given a little more room so the winner is
                the widest card as well as the highest one. */}
            {podium.length === 3 ? (
              // Bottom-aligned on every screen, so first place — the larger face,
              // in the wider middle column — stands above the other two. On a
              // phone the three stay side by side: stacked they were a screen
              // and a half, in a 2-1-3 order that only makes sense in a row.
              <section className="grid grid-cols-[1fr_1.12fr_1fr] items-end gap-4 sm:gap-5 max-sm:gap-2">
                <PodiumCard
                  row={podium[1]}
                  place={2}
                  isMe={podium[1].userId === me?.id}
                  gap={podium[0].totalXp - podium[1].totalXp}
                />
                <PodiumCard
                  row={podium[0]}
                  place={1}
                  isMe={podium[0].userId === me?.id}
                  gap={podium[0].totalXp - podium[1].totalXp}
                />
                <PodiumCard
                  row={podium[2]}
                  place={3}
                  isMe={podium[2].userId === me?.id}
                  gap={podium[1].totalXp - podium[2].totalXp}
                />
              </section>
            ) : null}

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 max-sm:p-3">
              <h2 className="text-xl font-semibold text-white max-sm:px-1 max-sm:text-lg">The whole board</h2>
              <ol className="mt-4 flex flex-col gap-2 max-sm:mt-3 max-sm:gap-1.5">
                {players.map((player, index) => {
                  const isMe = player.userId === me?.id;
                  return (
                    <li key={player.userId}>
                      <Link
                        href={`/players/${player.userId}`}
                        className={`flex items-center gap-3.5 rounded-xl bg-slate-950/60 p-3.5 transition hover:bg-slate-800 max-sm:gap-2.5 max-sm:px-2.5 max-sm:py-2.5 ${
                          isMe ? 'outline-dashed outline-1 outline-offset-[-1px] outline-amber-400/45' : ''
                        }`}
                      >
                        <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-slate-500 max-sm:w-5 max-sm:text-[13px]">
                          {index + 1}
                        </span>
                        <Avatar
                          avatar={player.avatar}
                          userKey={player.userId}
                          name={player.name}
                          photo={player.image}
                          className="h-10 w-10 max-sm:h-9 max-sm:w-9"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-white">
                            {player.name}
                            {isMe ? (
                              <span className="text-xs font-medium text-amber-300"> · you</span>
                            ) : null}
                          </span>
                          <span
                            className="block truncate text-xs text-slate-500"
                            title={exactly(player.lastPlayed)}
                          >
                            {player.band} · {player.played}{' '}
                            {player.played === 1 ? 'match' : 'matches'} ·{' '}
                            {timeSince(player.lastPlayed) ?? 'no matches yet'}
                          </span>
                        </span>
                        {/* A fixed 96px column is right beside an XP column on a
                            wide screen; on a phone it is most of the name's room. */}
                        <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-amber-300 max-sm:w-auto">
                          Level {player.level}
                        </span>
                        <span className="hidden w-24 shrink-0 text-right text-[13px] tabular-nums text-slate-500 sm:block">
                          {player.totalXp.toLocaleString()} XP
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
