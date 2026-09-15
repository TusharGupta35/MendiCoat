import { Crown, Layers, Scissors, Spade, Trophy } from 'lucide-react';
import { HowToPlay } from '@/components/HowToPlay';

const QUICK_STEPS = [
  {
    title: 'Pick a team',
    body: 'Create or join a room, then pick a team. Partners sit opposite each other — Seats 1 & 3 are Team A, Seats 2 & 4 are Team B.',
  },
  {
    title: 'The deal',
    body: 'All 52 cards are dealt, 13 to each player. A random seat leads the first trick.',
  },
  {
    title: 'Follow or cut',
    body: 'Follow the led suit whenever you hold it. When you cannot, the card you play sets trump.',
  },
  {
    title: 'Take the 10s',
    body: 'Win tricks to capture the four 10s — they decide the match.',
  },
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

/** The Mendi Coat rules, in the shared card layout every game's page uses. */
export function GameInstructions() {
  return (
    <HowToPlay
      heading="How to play - By PRATIMA"
      badge="4 players · 13 tricks"
      intro="Mendi Coat is a partnership trick-taking game played with a full deck. The four 10s decide who wins."
      steps={QUICK_STEPS}
      rules={RULES}
    />
  );
}
