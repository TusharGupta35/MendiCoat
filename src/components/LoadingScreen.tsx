const SUITS = [
  { symbol: "♠", className: "text-slate-200" },
  { symbol: "♥", className: "text-rose-500" },
  { symbol: "♣", className: "text-slate-200" },
  { symbol: "♦", className: "text-rose-500" },
];

interface LoadingScreenProps {
  /** Short line shown under the logo, e.g. "Loading your rooms…" */
  message?: string;
  /** Fill the viewport (route-level loading) vs. sit inside a container. */
  fullScreen?: boolean;
}

export function LoadingScreen({
  message = "Loading…",
  fullScreen = true,
}: LoadingScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-8 bg-slate-950 px-6 text-center ${
        fullScreen ? "min-h-screen" : "min-h-[280px] w-full rounded-2xl"
      }`}
    >
      {fullScreen ? (
        <div className="flex items-center justify-center gap-2 select-none">
          <span className="text-3xl font-black uppercase tracking-[0.15em] text-white sm:text-4xl">
            Dehel
          </span>
          <span className="text-4xl font-black tracking-normal text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)] sm:text-5xl">
            पकड़
          </span>
        </div>
      ) : null}

      <div className="relative flex h-20 w-20 items-center justify-center">
        <span className="animate-loader-ring absolute inset-0 rounded-full border-4 border-slate-800 border-t-amber-400" />
        <span className="text-2xl font-black text-amber-400">♠</span>
      </div>

      <div className="flex items-center gap-3">
        {SUITS.map((suit, index) => (
          <span
            key={suit.symbol}
            className={`animate-loader-suit text-2xl ${suit.className}`}
            style={{ animationDelay: `${index * 0.15}s` }}
          >
            {suit.symbol}
          </span>
        ))}
      </div>

      <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-400">
        {message}
      </p>
    </div>
  );
}
