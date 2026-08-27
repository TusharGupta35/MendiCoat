import { ChevronDown, Crown, Layers, Scissors, Spade, Trophy } from 'lucide-react';

const QUICK_STEPS = [
  'Create or join a room, then pick a team. Partners sit opposite each other — Seats 1 & 3 are Team A, Seats 2 & 4 are Team B.',
  'All 52 cards are dealt, 13 to each player. A random seat leads the first trick.',
  'Follow the led suit whenever you hold it. When you cannot, the card you play sets trump.',
  'Win tricks to capture the four 10s — they decide the match.',
];

const RULES = [
  {
    icon: Spade,
    title: 'Following suit',
    body: 'If you hold a card in the led suit you must play it. Aces are high and 2s are low: A K Q J 10 9 8 7 6 5 4 3 2.',
  },
  {
    icon: Scissors,
    title: 'The cut sets trump',
    body: 'A hand starts with no trump. The first time a player is void in the led suit and plays off-suit, that card’s suit becomes trump. It counts immediately — including in the trick being played — so the cutter takes that trick unless someone over-trumps with a higher trump. Once set, trump is fixed for the rest of the hand.',
  },
  {
    icon: Layers,
    title: 'Winning a trick',
    body: 'The highest trump takes the trick. If no trump was played, the highest card of the led suit takes it. The winner leads the next trick.',
  },
  {
    icon: Trophy,
    title: 'Winning the match',
    body: 'After all 13 tricks, the team holding more 10s wins. Level on 10s, the team that won more tricks takes it — level on both is a draw.',
  },
  {
    icon: Crown,
    title: 'Coat',
    body: 'Sweep all four 10s and it is a coat: a shutout, announced at the table for everyone to see.',
  },
];

/**
 * The dashboard rules card. Stays a server component — the expandable section
 * is a plain <details>, so the full rules cost no client JavaScript.
 */
export function GameInstructions() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-white">How to play</h2>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
          4 players · 13 tricks
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Mendi Coat is a partnership trick-taking game played with a full deck. The four 10s decide who wins.
      </p>

      <ol className="mt-5 space-y-3">
        {QUICK_STEPS.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-semibold text-amber-300">
              {index + 1}
            </span>
            <p className="text-sm text-slate-300">{step}</p>
          </li>
        ))}
      </ol>

      <details className="group mt-5 border-t border-slate-800 pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-amber-300 transition hover:text-amber-200 [&::-webkit-details-marker]:hidden">
          Full rules
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-4 space-y-4">
          {RULES.map(({ icon: Icon, title, body }) => (
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
    </div>
  );
}
