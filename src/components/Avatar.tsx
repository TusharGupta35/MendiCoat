import { avatarById, initialsOf, type Avatar as AvatarData } from '@/lib/avatars';

/**
 * Draws a character from the shared set of shapes. No hooks, so it works in
 * server and client components alike.
 *
 * Everything is built from circles, ellipses and short arcs on a 100x100 grid
 * rather than hand-drawn paths, which keeps the whole cast consistent and makes
 * a new character a matter of adding data.
 */

const HEAD = { cx: 50, cy: 46, r: 21 };

function Hair({ avatar }: { avatar: AvatarData }) {
  const { hair, hairStyle } = avatar;
  const { cx, cy, r } = HEAD;

  switch (hairStyle) {
    case 'buzz':
      return <path d={`M${cx - r} ${cy - 9} A ${r} ${r} 0 0 1 ${cx + r} ${cy - 9} Z`} fill={hair} opacity="0.9" />;
    case 'short':
      return (
        <>
          <path d={`M${cx - r - 1} ${cy - 8} A ${r + 1} ${r + 1} 0 0 1 ${cx + r + 1} ${cy - 8} Z`} fill={hair} />
          <rect x={cx - r - 1} y={cy - 4} width="5" height="10" rx="2.5" fill={hair} />
          <rect x={cx + r - 4} y={cy - 4} width="5" height="10" rx="2.5" fill={hair} />
        </>
      );
    case 'bun':
      return (
        <>
          <circle cx={cx} cy={cy - r - 5} r="8" fill={hair} />
          <path d={`M${cx - r - 1} ${cy - 7} A ${r + 1} ${r + 1} 0 0 1 ${cx + r + 1} ${cy - 7} Z`} fill={hair} />
        </>
      );
    case 'long':
      return (
        <>
          <path d={`M${cx - r - 2} ${cy - 6} A ${r + 2} ${r + 2} 0 0 1 ${cx + r + 2} ${cy - 6} Z`} fill={hair} />
          <rect x={cx - r - 2} y={cy - 8} width="7" height="34" rx="3.5" fill={hair} />
          <rect x={cx + r - 5} y={cy - 8} width="7" height="34" rx="3.5" fill={hair} />
        </>
      );
    case 'wavy':
      return (
        <>
          <path d={`M${cx - r - 2} ${cy - 7} A ${r + 2} ${r + 2} 0 0 1 ${cx + r + 2} ${cy - 7} Z`} fill={hair} />
          <path
            d={`M${cx - r - 2} ${cy - 7} q 4 12 0 22 q 5 3 8 -2 l 0 -20 Z`}
            fill={hair}
          />
          <path d={`M${cx + r + 2} ${cy - 7} q -4 12 0 22 q -5 3 -8 -2 l 0 -20 Z`} fill={hair} />
        </>
      );
    case 'braid':
      return (
        <>
          <path d={`M${cx - r - 2} ${cy - 6} A ${r + 2} ${r + 2} 0 0 1 ${cx + r + 2} ${cy - 6} Z`} fill={hair} />
          <rect x={cx + r - 4} y={cy - 2} width="7" height="26" rx="3.5" fill={hair} />
          <circle cx={cx + r} cy={cy + 26} r="4" fill={hair} />
        </>
      );
    case 'turban':
      return (
        <>
          <path d={`M${cx - r - 4} ${cy - 2} A ${r + 4} ${r + 4} 0 0 1 ${cx + r + 4} ${cy - 2} Z`} fill={hair} />
          <ellipse cx={cx} cy={cy - r + 5} rx={r + 4} ry="13" fill={hair} />
          {/* The wrap, and the jewel pinned at the front. */}
          <path
            d={`M${cx - r - 3} ${cy - 4} q ${r} -14 ${2 * r + 6} -4`}
            stroke="#fff"
            strokeOpacity="0.16"
            strokeWidth="3"
            fill="none"
          />
          <circle cx={cx} cy={cy - r - 1} r="3.4" fill="#ffc233" />
        </>
      );
    case 'cap':
      return (
        <>
          <path d={`M${cx - r - 1} ${cy - 9} A ${r + 1} ${r + 1} 0 0 1 ${cx + r + 1} ${cy - 9} Z`} fill={hair} />
          <rect x={cx - r - 7} y={cy - 12} width="22" height="5" rx="2.5" fill={hair} />
        </>
      );
  }
}

function Accessory({ avatar }: { avatar: AvatarData }) {
  const { cx, cy, r } = HEAD;

  switch (avatar.accessory) {
    case 'glasses':
      return (
        <g stroke="#1f2937" strokeWidth="1.6" fill="none" opacity="0.85">
          <circle cx={cx - 8} cy={cy + 1} r="6" />
          <circle cx={cx + 8} cy={cy + 1} r="6" />
          <line x1={cx - 2} y1={cy + 1} x2={cx + 2} y2={cy + 1} />
        </g>
      );
    case 'shades':
      return (
        <g fill="#111827">
          <rect x={cx - 15} y={cy - 4} width="13" height="9" rx="3" />
          <rect x={cx + 2} y={cy - 4} width="13" height="9" rx="3" />
          <rect x={cx - 3} y={cy - 1} width="6" height="2" />
        </g>
      );
    case 'earrings':
      return (
        <g fill="#ffc233">
          <circle cx={cx - r + 1} cy={cy + 8} r="2.6" />
          <circle cx={cx + r - 1} cy={cy + 8} r="2.6" />
        </g>
      );
    case 'moustache':
      return <path d={`M${cx - 7} ${cy + 11} q 7 -4 14 0 q -7 3 -14 0 Z`} fill={avatar.hair} />;
    case 'beard':
      return (
        <path
          d={`M${cx - 15} ${cy + 4} q 0 20 15 20 q 15 0 15 -20 q -6 10 -15 10 q -9 0 -15 -10 Z`}
          fill={avatar.hair}
          opacity="0.95"
        />
      );
    case 'bindi':
      return <circle cx={cx} cy={cy - 9} r="2.4" fill="#e11d48" />;
    case 'crown':
      return (
        <g fill="#ffc233">
          <path d={`M${cx - 13} ${cy - r - 2} l 3 -10 l 5 6 l 5 -9 l 5 9 l 5 -6 l 3 10 Z`} />
        </g>
      );
    case 'none':
      return null;
  }
}

export function AvatarFace({ avatar }: { avatar: AvatarData }) {
  const { cx, cy, r } = HEAD;
  const clipId = `av-clip-${avatar.id}`;
  const gradientId = `av-bg-${avatar.id}`;
  const sheenId = `av-sheen-${avatar.id}`;

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={avatar.from} />
          <stop offset="100%" stopColor={avatar.to} />
        </linearGradient>
        <radialGradient id={sheenId} cx="0.3" cy="0.16" r="0.8">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="70%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <circle cx="50" cy="50" r="50" fill={`url(#${gradientId})`} />
        {/* Light falling from the top left, so the disc is not a flat colour. */}
        <circle cx="50" cy="50" r="50" fill={`url(#${sheenId})`} />

        {/* Neck first, then shoulders over it, then the head in front of both. */}
        <rect x={cx - 7} y={cy + r - 8} width="14" height="16" rx="6" fill={avatar.skin} />
        <rect x={cx - 7} y={cy + r - 8} width="14" height="16" rx="6" fill="#000" opacity="0.16" />
        <ellipse cx="50" cy="112" rx="31" ry="26" fill={avatar.outfit} />
        <path d={`M28 100 q 22 -12 44 0`} stroke="#000" strokeWidth="1.4" opacity="0.15" fill="none" />

        <circle cx={cx} cy={cy} r={r} fill={avatar.skin} />
        {/* A touch of shading down one side keeps the face from reading flat. */}
        <path d={`M${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} Z`} fill="#000" opacity="0.06" />
        <Hair avatar={avatar} />
        {/* Dark hair on a dark disc loses its shape entirely without this. */}
        {avatar.hairStyle === 'turban' ? null : (
          <path
            d={`M${cx - 14} ${cy - 12} q 7 -9 18 -7`}
            stroke="#fff"
            strokeOpacity="0.22"
            strokeWidth="3.2"
            strokeLinecap="round"
            fill="none"
          />
        )}

        {/* Eyes with a sclera and a catchlight — the single thing that stops a
            face reading as two dots on a circle. */}
        {[-7.5, 7.5].map((offset) => (
          <g key={offset}>
            <ellipse cx={cx + offset} cy={cy + 1} rx="3.6" ry="4.1" fill="#fdfdfd" />
            <circle cx={cx + offset} cy={cy + 1.6} r="2.1" fill="#1f2937" />
            <circle cx={cx + offset - 0.9} cy={cy + 0.3} r="0.85" fill="#fff" />
          </g>
        ))}
        {[-7.5, 7.5].map((offset) => (
          <path
            key={`brow${offset}`}
            d={`M${cx + offset - 4.5} ${cy - 6} q 4.5 -2.6 9 0`}
            stroke={avatar.hair}
            strokeWidth="1.7"
            strokeLinecap="round"
            fill="none"
            opacity="0.85"
          />
        ))}
        <path
          d={`M${cx - 5.5} ${cy + 10.5} q 5.5 4.5 11 0`}
          stroke="#7c3f2f"
          strokeWidth="1.9"
          strokeLinecap="round"
          fill="none"
        />
        <Accessory avatar={avatar} />
      </g>
    </>
  );
}

interface AvatarProps {
  /** The chosen avatar id, if the player has picked one. */
  avatar?: string | null;
  /** Stable identity retained for callers and level-avatar composition. */
  userKey: string;
  name: string;
  /** A photo from the sign-in provider, used only when nothing is picked. */
  photo?: string | null;
  className?: string;
}

export function Avatar({ avatar, name, photo, className }: AvatarProps) {
  const size = className ?? 'h-10 w-10';
  const face = avatarById(avatar);

  // A provider photo is shown when the player has not chosen a built-in avatar.
  if (!face && photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        aria-hidden="true"
        className={`${size} shrink-0 rounded-full object-cover ring-1 ring-slate-700`}
      />
    );
  }

  // Do not invent a character for players who have not chosen one and have no
  // provider photo. Initials make the absence of an avatar explicit.
  if (!face) {
    return (
      <span
        className={`${size} flex shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200 ring-1 ring-slate-700`}
        role="img"
        aria-label={`${name}'s avatar`}
      >
        {initialsOf(name)}
      </span>
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      className={`${size} shrink-0 rounded-full ring-1 ring-slate-700`}
      role="img"
      aria-label={`${name}'s avatar`}
    >
      <AvatarFace avatar={face} />
    </svg>
  );
}

/**
 * An avatar wearing its owner's level: the ring around it fills with progress
 * through the current level, and the number sits in the corner.
 *
 * The ring is the border rather than an extra element beside it, so a small
 * avatar carries the information without taking any more room.
 */
export function LevelAvatar({
  level,
  into,
  span,
  className,
  ...avatar
}: AvatarProps & { level: number; into: number; span: number }) {
  const fraction = span > 0 ? Math.min(1, Math.max(0, into / span)) : 0;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.round(fraction * 100);

  return (
    <span
      className={`relative inline-block shrink-0 ${className ?? 'h-14 w-14'}`}
      title={`Level ${level} · ${percent}% of the way to ${level + 1}`}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#35234f" strokeWidth="7" />
        {fraction > 0 ? (
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#ffc233"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
          />
        ) : null}
      </svg>

      <Avatar {...avatar} className="absolute inset-[11%] h-[78%] w-[78%]" />

      <span
        className="absolute -bottom-0.5 -left-0.5 min-w-[1.35rem] rounded-full bg-slate-950 px-1 text-center text-[10px] font-bold leading-4 text-amber-300 ring-1 ring-amber-400/60"
        aria-label={`Level ${level}`}
      >
        {level}
      </span>
    </span>
  );
}

export { initialsOf };
