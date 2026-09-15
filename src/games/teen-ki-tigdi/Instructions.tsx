import { Coins, Eye, Gavel, Spade, Swords, Users } from 'lucide-react';
import { HowToPlay } from '@/components/HowToPlay';

const QUICK_STEPS = [
  {
    title: 'Take a seat',
    body: 'Sit down with 5, 6 or 7 people. Everyone gets the same number of cards, and the deck holds exactly 250 points.',
  },
  {
    title: 'Bid',
    body: 'Bid for the hand. Say how many of those 250 points you think your side can take — highest bid wins the right to name everything.',
  },
  {
    title: 'Call partners',
    body: 'The winner picks trump, then calls cards. Whoever is holding a called card is their partner, and nobody is told who that is.',
  },
  {
    title: 'Play tricks',
    body: 'Play tricks. Partners give themselves away only when a called card finally hits the table.',
  },
  {
    title: 'Count up',
    body: 'Count up. The bidder’s side must reach the bid — fall one point short and the other side takes the hand.',
  },
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
 * The Teen Ki Tigdi rules, in the same card layout as Mendi Coat's, so a player
 * moving between the two games reads them the same way.
 */
export function TigdiInstructions() {
  return (
    <HowToPlay
      heading="How to play"
      badge="5–7 players · 250 points"
      intro="A bidding game with hidden partners. You buy the hand, name trump, and call two cards to pick a team you cannot see — and neither can anyone else."
      steps={QUICK_STEPS}
      rules={RULES}
    />
  );
}
