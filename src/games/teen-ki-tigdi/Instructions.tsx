import { ChevronDown, Coins, Eye, Gavel, Spade, Swords, Users } from 'lucide-react';

const QUICK_STEPS = [
  'Sit down with 5, 6 or 7 people. Everyone gets the same number of cards, and the deck holds exactly 250 points.',
  'Bid for the hand. Say how many of those 250 points you think your side can take — highest bid wins the right to name everything.',
  'The winner picks trump, then calls cards. Whoever is holding a called card is their partner, and nobody is told who that is.',
  'Play tricks. Partners give themselves away only when a called card finally hits the table.',
  'Count up. The bidder’s side must reach the bid — fall one point short and the other side takes the hand.',
];

const RULES = [
  {
    icon: Coins,
    title: 'What the cards are worth',
    body: 'Ace, King, Queen, Jack and 10 are 10 points each. Every 5 is worth 5. The 3♠ — the tigdi — is worth 30 on its own. Everything else is worth nothing. That is 250 points in the deck, whichever table size you play.',
  },
  {
    icon: Gavel,
    title: 'Bidding',
    body: 'Bidding opens at 130 and climbs in 5s. Raise or pass — a pass is final, and once everyone but one has passed, that player has bought the hand. If nobody bids at all, the deal moves on and the cards are thrown in.',
  },
  {
    icon: Users,
    title: 'Calling partners',
    body: 'The bidder names trump, then calls cards they are not holding: one at five players, two at six or seven. Whoever holds a called card is on the bidder’s side and knows it immediately. Call two cards that turn out to be in the same hand and you have quietly given yourself one partner instead of two.',
  },
  {
    icon: Eye,
    title: 'Who is on whose side',
    body: 'Everyone can see which cards were called. Nobody can see who holds them. You know your own side and no one else’s, so the first few tricks are read as much as they are played — who is helping, who is blocking, and which called card has still not appeared.',
  },
  {
    icon: Spade,
    title: 'Following suit',
    body: 'Follow the led suit while you hold it. When you cannot, play anything — trump included. Aces high, 2s low.',
  },
  {
    icon: Swords,
    title: 'Taking tricks',
    body: 'Highest trump wins the trick; with no trump in it, the highest card of the led suit does. The winner takes every point on the table and leads the next one.',
  },
];

/**
 * The Teen Ki Tigdi rules card, cut to match the Mendi Coat one so a player
 * moving between the two games reads them the same way. A plain <details> for
 * the long half, so it stays a server component.
 */
export function TigdiInstructions() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-white">How to play</h2>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
          5–7 players · 250 points
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        A bidding game with hidden partners. You buy the hand, name trump, and call two cards to
        pick a team you cannot see — and neither can anyone else.
      </p>

      <ol className="mt-5 space-y-3">
        {QUICK_STEPS.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-xs font-semibold text-rose-300">
              {index + 1}
            </span>
            <p className="text-sm text-slate-300">{step}</p>
          </li>
        ))}
      </ol>

      <details className="group mt-5 border-t border-slate-800 pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-rose-300 transition hover:text-rose-200 [&::-webkit-details-marker]:hidden">
          Full rules
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-4 space-y-4">
          {RULES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
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
