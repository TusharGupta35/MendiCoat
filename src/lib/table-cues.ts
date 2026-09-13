'use client';

/**
 * The sounds a card table makes.
 *
 * Synthesised rather than loaded, so the table has a voice without shipping
 * audio files or waiting on a network request for the first card of a match.
 *
 * Shared between games on purpose: a card landing should sound the same
 * wherever it lands, so moving from one table to another feels like the same
 * room. A game with a beat of its own adds a cue here rather than growing its
 * own audio.
 */

let context: AudioContext | null = null;

function audio() {
  if (typeof window === 'undefined') return null;
  context ??= new AudioContext();
  // Browsers start the context suspended until a gesture; resuming on every cue
  // means the first click a player makes unlocks the rest.
  void context.resume();
  return context;
}

function tone(
  frequency: number,
  duration = 0.09,
  delay = 0,
  peak = 0.06,
  type: OscillatorType = 'sine',
) {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

/**
 * Releases the audio device when a table is left. The context is rebuilt lazily
 * on the next cue, so this is safe to call whenever a room unmounts.
 */
export function closeCues() {
  void context?.close();
  context = null;
}

export type TableCue =
  | 'card'
  | 'trick'
  | 'trump'
  | 'coat'
  | 'invalid'
  | 'start'
  | 'tap'
  /** Teen Ki Tigdi: a called card lands and a hidden partner is named. */
  | 'reveal'
  /** Teen Ki Tigdi: the auction closes and someone owns the hand. */
  | 'bid';

/** Named cues, so call sites read as intent instead of raw frequencies. */
export function playCue(cue: TableCue) {
  switch (cue) {
    case 'card':
      // The original card beep. A quieter, noise-based "felt" version read as
      // silence on normal speakers, so this stays as it was.
      tone(280, 0.09, 0, 0.06);
      return;
    case 'trick':
      // Two rising notes: someone just took the trick.
      tone(523, 0.1, 0, 0.05);
      tone(784, 0.16, 0.08, 0.05);
      return;
    case 'trump':
      // A bell over a rising sweep for the card that fixes trump.
      tone(392, 0.12, 0, 0.05);
      tone(587, 0.14, 0.1, 0.05);
      tone(880, 0.4, 0.2, 0.06, 'triangle');
      return;
    case 'coat':
      // Four-note fanfare for a shutout.
      [523, 659, 784, 1047].forEach((frequency, index) =>
        tone(frequency, index === 3 ? 0.5 : 0.14, index * 0.11, 0.06, 'triangle'),
      );
      return;
    case 'invalid':
      tone(150, 0.2, 0, 0.05, 'sawtooth');
      return;
    case 'start':
      tone(440, 0.12, 0, 0.05);
      tone(660, 0.18, 0.1, 0.05);
      return;
    case 'tap':
      tone(440, 0.05, 0, 0.045);
      return;
    case 'reveal':
      // A turn upward that does not resolve — someone has just been outed, and
      // the table is not finished with them yet.
      tone(466, 0.12, 0, 0.05, 'triangle');
      tone(622, 0.14, 0.09, 0.05, 'triangle');
      tone(932, 0.3, 0.19, 0.05, 'triangle');
      return;
    case 'bid':
      // A gavel: two flat knocks.
      tone(196, 0.09, 0, 0.06, 'triangle');
      tone(196, 0.14, 0.11, 0.06, 'triangle');
  }
}
