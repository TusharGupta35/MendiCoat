/**
 * The reactions a guesser can throw at a drawing without typing. Doodle
 * Dhamaka's own set rather than the card tables': "good partner" means nothing
 * here, and 💀 is the only honest response to some drawings.
 */
export const DOODLE_REACTIONS = [
  { emoji: '😂', label: 'Funny' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '💀', label: 'Dead' },
  { emoji: '🤯', label: 'Mind blown' },
  { emoji: '👀', label: 'Watching' },
  { emoji: '😭', label: 'Crying' },
  { emoji: '👏', label: 'Nice' },
] as const;

/** Small typing-friendly set for chat messages, separate from floating reactions. */
export const DOODLE_CHAT_EMOJIS = ['😀', '😂', '😅', '🔥', '💀', '👀', '👏', '❤️', '🎨', '🤔', '😭', '🎉'] as const;

export const isDoodleReaction = (value: unknown): value is string =>
  typeof value === 'string' && DOODLE_REACTIONS.some((reaction) => reaction.emoji === value);
