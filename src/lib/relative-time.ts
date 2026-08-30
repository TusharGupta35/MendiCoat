/**
 * How long ago something happened, in words.
 *
 * Two units at most and never more precise than it needs to be: "3h 20m ago"
 * while that is interesting, "4d 3h ago" once the hours stop mattering, and
 * plain months once the days do. A board full of exact timestamps is a board
 * nobody reads.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function timeSince(then: Date | null | undefined, now: Date = new Date()): string | null {
  if (!then) return null;
  const elapsed = now.getTime() - then.getTime();

  // A clock skewed a little the wrong way should read as "now", not as a
  // negative age — the server and the row can disagree by a second or two.
  if (elapsed < MINUTE) return 'just now';

  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m ago`;
  }

  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    const minutes = Math.floor((elapsed % HOUR) / MINUTE);
    return minutes === 0 ? `${hours}h ago` : `${hours}h ${minutes}m ago`;
  }

  if (elapsed < MONTH) {
    const days = Math.floor(elapsed / DAY);
    const hours = Math.floor((elapsed % DAY) / HOUR);
    return hours === 0 ? `${days}d ago` : `${days}d ${hours}h ago`;
  }

  if (elapsed < YEAR) {
    return `${Math.floor(elapsed / MONTH)}mo ago`;
  }

  const years = Math.floor(elapsed / YEAR);
  return `${years}y ago`;
}

/** The full date, for the tooltip behind the short form. */
export function exactly(then: Date | null | undefined): string | undefined {
  if (!then) return undefined;
  return then.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
