import { Bomb, Eye, Gavel, HelpCircle, Heart, Trophy, Users, Vote } from 'lucide-react';
import { HowToPlay } from '@/components/HowToPlay';

const QUICK_STEPS = [
  {
    title: 'Gather 4 or more',
    body: 'Four to twelve friends, no bots — a bot cannot invent an answer and then defend it. Before starting, everyone can add their own questions about the group.',
  },
  {
    title: 'Read your card',
    body: 'Everyone sees the question. Except one person, who sees only what shape the answer takes: a number, a name, one food item.',
  },
  {
    title: 'Answer in turn',
    body: 'One at a time, in an order reshuffled every round. Everyone sees each answer as it lands — including the impostor, who is working out what was asked.',
  },
  {
    title: 'Argue, then vote',
    body: 'Seventy-five seconds of open discussion, a final fifteen, then everyone names who they think never saw it.',
  },
];

const RULES = [
  {
    icon: HelpCircle,
    title: 'The whole game',
    body: 'Prove you saw the question without handing it to the impostor. Too vague and the table suspects you; too specific and the impostor walks it.',
  },
  {
    icon: Eye,
    title: 'Being the impostor',
    body: 'You are told the answer format, never the question. Read what everyone else says, work backwards, and answer like you belong. Going last is easier than going first — and the order changes every round.',
  },
  {
    icon: Vote,
    title: 'Voting',
    body: 'Name an impostor and you score 2. The impostor scores 1 for every vote that went somewhere else, so even a round they lose is worth playing well.',
  },
  {
    icon: Gavel,
    title: 'The steal-back',
    body: 'Caught impostors get one last shot: three questions on screen, one of them real. Name it and take 3 points anyway. Getting caught is not the end.',
  },
  {
    icon: Bomb,
    title: 'Chaals',
    body: 'About half the rounds have a twist. Two impostors who do not know about each other. One word each. No discussion at all. Votes shown as they are cast. And once a match, maybe, no impostor at all.',
  },
  {
    icon: Users,
    title: 'Who gets the role',
    body: 'Weighted random, never a rotation — the longer since you were the impostor the likelier you are, but nothing is promised and repeats happen. Nobody is told the count, so nobody can do the arithmetic.',
  },
  {
    icon: Heart,
    title: 'Friend questions',
    body: 'Questions you add in the lobby stay secret and get mixed in. A question about the five of you beats ten we could write — recognising one would tell you you are not the impostor, so only you can see yours.',
  },
  {
    icon: Trophy,
    title: 'Winning',
    body: 'One round per player, highest total wins. A tie at the top plays one Sudden Death round: no Chaal, a short argument, no steal-back.',
  },
];

export function ImpostorInstructions() {
  return (
    <HowToPlay
      heading="How to play"
      badge="4–12 players · no bots"
      intro="Everyone answers the same question. One of you never saw it. Find them — before they work out what was asked."
      steps={QUICK_STEPS}
      rules={RULES}
      theme="doodle"
    />
  );
}
