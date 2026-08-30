/**
 * Gold, silver and bronze — the look of the top three, wherever a board is
 * shown.
 *
 * One definition rather than a copy per board: the dashboard's top five and the
 * full players list are the same ranking cut to different lengths, and a podium
 * that looked different between them would read as two different rankings.
 */
export const PODIUM = [
  {
    badge:
      'bg-gradient-to-br from-amber-200 to-amber-500 text-amber-950 shadow-[0_0_12px_rgba(255,194,51,0.45)]',
    row: 'bg-amber-500/[0.07] ring-1 ring-amber-400/40',
  },
  {
    badge: 'bg-gradient-to-br from-slate-100 to-slate-400 text-slate-900',
    row: 'bg-slate-800/40 ring-1 ring-slate-400/30',
  },
  {
    badge: 'bg-gradient-to-br from-[#e0a06a] to-[#8b5a2b] text-[#2a1608]',
    row: 'bg-[#8b5a2b]/10 ring-1 ring-[#c8874a]/30',
  },
] as const;

export type Podium = (typeof PODIUM)[number];

/** The medal for a place, counting from zero. Nothing below third. */
export const podiumFor = (index: number): Podium | undefined => PODIUM[index];
