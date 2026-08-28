/**
 * One-tap reactions. They travel down the same channel as a typed thought, so
 * the server needed no new message type — the client just recognises these
 * exact strings and floats them over the sender's seat instead of printing
 * them in the chat line.
 */
export const EMOTES = [
  { emoji: '👏', label: 'Nice play' },
  { emoji: '🔥', label: 'On fire' },
  { emoji: '😱', label: 'No way' },
  { emoji: '😂', label: 'Funny' },
  { emoji: '🤝', label: 'Good partner' },
  { emoji: '🧊', label: 'Ice cold' },
] as const;

const EMOJIS: string[] = EMOTES.map((emote) => emote.emoji);

export const isEmote = (message: string) => EMOJIS.includes(message.trim());
