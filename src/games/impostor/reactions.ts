/**
 * The reactions you can throw at somebody's answer without interrupting them.
 *
 * Impostor's own set rather than the card tables' or Doodle Dhamaka's: this is
 * a game of accusations, so what the table needs is a way to gasp, to call
 * something out and to die laughing — not to say "good partner".
 */
export const IMPOSTOR_REACTIONS = [
  { emoji: '😂', label: 'Funny' },
  { emoji: '🤯', label: 'Mind blown' },
  { emoji: '👀', label: 'Suspicious' },
  { emoji: '💀', label: 'Dead' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '😭', label: 'Crying' },
  { emoji: '👏', label: 'Respect' },
  { emoji: '😱', label: 'No way' },
] as const;

export const isImpostorReaction = (value: unknown): value is string =>
  typeof value === 'string' && IMPOSTOR_REACTIONS.some((reaction) => reaction.emoji === value);
