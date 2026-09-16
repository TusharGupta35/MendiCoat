import { Bomb, Clock, Heart, Lightbulb, Lock, Paintbrush, Target, Trophy } from 'lucide-react';
import { HowToPlay } from '@/components/HowToPlay';

const QUICK_STEPS = [
  {
    title: 'Gather 4 or more',
    body: 'Four to twelve friends. Before starting, everyone can slip in their own words — inside jokes, places, each other.',
  },
  {
    title: 'Draw',
    body: 'Take turns as the drawer. Pick one of three prompts — easy, medium, or something wild — and draw it for the table.',
  },
  {
    title: 'Guess',
    body: 'Everyone else types guesses. Wrong ones show up for all to see; a right one just says you got it, never what it was.',
  },
  {
    title: 'Survive the Dhamaka',
    body: 'Every round has a surprise rule — one stroke only, a blind artist, fake guesses in the chat. The last round has three.',
  },
];

const RULES = [
  {
    icon: Target,
    title: 'Guessing',
    body: 'The faster you get it, the more it is worth — up to 500 in the first few seconds. Once you have it you can keep chatting, but only to others who have it too.',
  },
  {
    icon: Lightbulb,
    title: 'Hints',
    body: 'As the clock runs, a letter appears, then the category, then more letters. Each hint that is out when you guess cuts what you score — wait for help, or guess now?',
  },
  {
    icon: Lock,
    title: 'Lock guess',
    body: 'Once a round you can lock a guess in. Right, and it scores double. Wrong, and it costs you 50.',
  },
  {
    icon: Paintbrush,
    title: 'Drawing',
    body: 'The drawer scores for every person who gets it. Everyone gets it: a Perfect Draw, with a bonus for all. Nobody gets it: a Disaster Draw, and nothing.',
  },
  {
    icon: Bomb,
    title: 'Dhamakas',
    body: 'Rules that change the round — Tiny Pen, Mirror Artist, No Chat, 30-Second Panic, Fog and more. Every fourth round is a Double Dhamaka; the final round is a Grand. The hard ones are worth extra.',
  },
  {
    icon: Clock,
    title: 'Streaks',
    body: 'Guess three rounds in a row and a streak bonus starts adding up. Miss one and it starts again.',
  },
  {
    icon: Heart,
    title: 'Friend words',
    body: 'Words you add in the lobby are kept secret and mixed into the prompts. Nobody else sees them until someone has to draw one.',
  },
  {
    icon: Trophy,
    title: 'Winning',
    body: 'Everyone draws twice at a table of six or fewer, once at a bigger one. Highest score at the end wins — with awards for the best artist, the fastest guesser, and the most chaotic.',
  },
];

export function DoodleInstructions() {
  return (
    <HowToPlay
      heading="How to play"
      badge="4–12 players · no bots"
      intro="Someone draws, everyone guesses — and every round, a Dhamaka changes the rules. You know how to play. You never know what the next round will do."
      steps={QUICK_STEPS}
      rules={RULES}
      theme="doodle"
    />
  );
}
