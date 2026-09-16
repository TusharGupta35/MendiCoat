import type { Prompt } from './types';

/**
 * Deciding whether a guess is right.
 *
 * Forgiving on the things that are not the point — case, spaces, punctuation, a
 * plural, one slip of the thumb on a long word — and strict on the thing that
 * is: a scene is only got by naming every idea in it.
 */

/** Lowercase letters and digits, words separated by single spaces. */
export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The same, with the spaces gone: "pani puri" and "panipuri" are one guess. */
export const compact = (text: string) => normalise(text).replace(/ /g, '');

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Whether two single terms are the same word, allowing for how people type.
 *
 * A plural either way always counts. A one-letter slip only counts on words of
 * six letters or more — on "cat" one letter is "car", a different drawing.
 */
function sameTerm(guess: string, target: string): boolean {
  if (!guess || !target) return false;
  if (guess === target) return true;
  if (guess === `${target}s` || target === `${guess}s`) return true;
  if (guess === `${target}es` || target === `${guess}es`) return true;
  return target.length >= 6 && levenshtein(guess, target) <= 1;
}

/** Does the guess name this term, anywhere in it? Multi-word terms match as a run. */
function mentions(guess: string, term: string): boolean {
  const target = compact(term);
  const words = normalise(guess).split(' ').filter(Boolean);
  const size = normalise(term).split(' ').length;
  // Try every run of words the same length as the term, and the whole guess
  // squashed together, so "pani puri" and "panipuri" both name "pani puri".
  for (let start = 0; start < words.length; start += 1) {
    for (let length = 1; length <= Math.max(size, 2) && start + length <= words.length; length += 1) {
      if (sameTerm(words.slice(start, start + length).join(''), target)) return true;
    }
  }
  return sameTerm(compact(guess), target);
}

export function isCorrect(guess: string, prompt: Prompt): boolean {
  const attempt = compact(guess);
  if (!attempt) return false;

  if (prompt.keywords?.length) {
    // Saying the whole sentence also counts, obviously.
    if (sameTerm(attempt, compact(prompt.text))) return true;
    return prompt.keywords.every((alternatives) =>
      alternatives.some((alternative) => mentions(guess, alternative)),
    );
  }

  return [prompt.text, ...(prompt.aliases ?? [])].some((answer) =>
    sameTerm(attempt, compact(answer)),
  );
}

/**
 * Whether a message would give the answer away if the wrong people saw it.
 * Used to stop the drawer from typing it, and to keep near-misses private.
 */
export function revealsAnswer(message: string, prompt: Prompt): boolean {
  const terms = prompt.keywords?.length
    ? prompt.keywords.flat()
    : [prompt.text, ...(prompt.aliases ?? [])];
  return terms.some((term) => compact(term).length >= 3 && mentions(message, term));
}

function bigrams(text: string): string[] {
  const grams: string[] = [];
  for (let index = 0; index < text.length - 1; index += 1) grams.push(text.slice(index, index + 2));
  return grams;
}

/** How alike two strings are, 0 to 1, by the letter pairs they share. */
export function similarity(a: string, b: string): number {
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left.length || !right.length) return a === b ? 1 : 0;
  const pool = [...right];
  let shared = 0;
  for (const gram of left) {
    const at = pool.indexOf(gram);
    if (at >= 0) {
      shared += 1;
      pool.splice(at, 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
}

export type Warmth = 'hot' | 'warm' | 'cold';

/**
 * Hot or Cold's answer to a wrong guess. Measured against the answer and every
 * idea in a scene, so naming one of a scene's two ideas reads as hot — which it
 * is.
 */
export function warmth(guess: string, prompt: Prompt): Warmth {
  const attempt = compact(guess);
  const targets = [prompt.text, ...(prompt.aliases ?? []), ...(prompt.keywords?.flat() ?? [])].map(compact);
  const best = Math.max(0, ...targets.map((target) => similarity(attempt, target)));
  if (prompt.keywords?.some((alternatives) => alternatives.some((term) => mentions(guess, term)))) {
    return 'hot';
  }
  if (best >= 0.6) return 'hot';
  if (best >= 0.3) return 'warm';
  return 'cold';
}
