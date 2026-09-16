import type { LucideIcon } from 'lucide-react';
import { Bomb, ChevronDown, MessageCircle, Paintbrush, UsersRound } from 'lucide-react';

/**
 * A game's rules, the same shape for every game.
 *
 * The short version is a row of cards — one per step, numbered like a card's
 * index and marked with a suit — so the part everyone reads looks like it
 * belongs to a card game rather than a terms page. The long version stays a
 * plain <details> underneath, so the whole thing is a server component and the
 * full rules cost no client JavaScript.
 *
 * On a phone the cards sit in a row you swipe along, instead of a stack four or
 * five screens tall.
 */

export interface HowToStep {
  title: string;
  body: string;
}

export interface HowToRule {
  icon: LucideIcon;
  title: string;
  body: string;
}

const SUITS = [
  { glyph: '♠', red: false },
  { glyph: '♥', red: true },
  { glyph: '♣', red: false },
  { glyph: '♦', red: true },
];

const DOODLE_MARKS: LucideIcon[] = [UsersRound, Paintbrush, MessageCircle, Bomb];

/** Written out in full because Tailwind reads class names, not variables. */
const COLUMNS: Record<number, string> = {
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-3 xl:grid-cols-5',
};

export function HowToPlay({
  heading,
  badge,
  intro,
  steps,
  rules,
  theme = 'cards',
}: {
  heading: string;
  badge: string;
  intro: string;
  steps: HowToStep[];
  rules: HowToRule[];
  theme?: 'cards' | 'doodle';
}) {
  const isDoodle = theme === 'doodle';

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white sm:text-xl">{heading}</h2>
        <span className="rounded-full bg-slate-950/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          {badge}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-slate-400 max-sm:hidden">{intro}</p>

      <ol
        className={`-mx-4 mt-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 ${
          COLUMNS[steps.length] ?? 'lg:grid-cols-4'
        }`}
      >
        {steps.map((step, index) => {
          const suit = SUITS[index % SUITS.length];
          const ink = suit.red ? 'text-rose-400' : 'text-amber-300';
          const DoodleMark = DOODLE_MARKS[index % DOODLE_MARKS.length];
          return (
            <li key={step.title} className="w-[236px] flex-none snap-start sm:w-auto">
              <div
                className={`h-full rounded-[22px] p-[2px] max-sm:rounded-[20px] ${
                  isDoodle
                    ? 'bg-[linear-gradient(145deg,#fde68a,#34d399_38%,#0f766e_70%,#f9a8d4)]'
                    : 'bg-[linear-gradient(160deg,#ffe08a,#e0900c_38%,#7a4a06_62%,#ffd970)]'
                }`}
              >
                <div
                  className={`relative h-full overflow-hidden rounded-[20px] p-3.5 max-sm:rounded-[18px] sm:p-[18px] ${
                    isDoodle
                      ? 'bg-[#122b30] bg-[linear-gradient(145deg,rgba(52,211,153,0.16),rgba(0,0,0,0.32))]'
                      : 'bg-[#211539] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.26))]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-[5px] rounded-[14px] sm:inset-[6px] sm:rounded-[15px] ${
                      isDoodle ? 'border border-emerald-200/20' : 'border border-amber-300/15'
                    }`}
                  />
                  <div className="relative flex items-start justify-between">
                    {isDoodle ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-display text-[22px] font-extrabold tabular-nums text-amber-200 sm:text-[26px]">
                            {index + 1}
                          </span>
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-300/15 text-emerald-200 sm:h-9 sm:w-9">
                            <DoodleMark className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2.2} />
                          </span>
                        </div>
                        <DoodleMark
                          aria-hidden="true"
                          className="h-14 w-14 text-emerald-300/[0.13] sm:h-[68px] sm:w-[68px]"
                          strokeWidth={1.2}
                        />
                      </>
                    ) : (
                      <>
                        {/* Numbered like a card's corner index: the rank, then the suit. */}
                        <div className="flex flex-col items-center leading-none">
                          <span className="font-display text-[22px] font-extrabold tabular-nums text-amber-300 sm:text-[26px]">
                            {index + 1}
                          </span>
                          <span className={`text-[13px] sm:text-base ${ink}`} aria-hidden="true">
                            {suit.glyph}
                          </span>
                        </div>
                        <span
                          aria-hidden="true"
                          className={`font-display text-[52px] leading-[0.8] opacity-[0.12] sm:text-[64px] ${ink}`}
                        >
                          {suit.glyph}
                        </span>
                      </>
                    )}
                  </div>
                  <h3 className="relative mt-2 text-lg font-semibold text-white sm:mt-2.5 sm:text-xl">
                    {step.title}
                  </h3>
                  <p className="relative mt-1 text-[13px] leading-relaxed text-slate-300 sm:mt-1.5 sm:text-sm">
                    {step.body}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <details className="group mt-5 border-t border-slate-800 pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-amber-300 transition hover:text-amber-200 [&::-webkit-details-marker]:hidden">
          Full rules
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {rules.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="mt-1 text-sm text-slate-400">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
