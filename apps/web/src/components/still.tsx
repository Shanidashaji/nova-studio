import type { ProjectType } from '@nova/shared';
import { cn, hashString } from '@/lib/utils';

/**
 * A production still. When a real frame exists (`src`) it is shown; otherwise NOVA renders a
 * deterministic "graded frame": an abstract composition whose motif follows the project type and
 * whose grade follows the client's colour. No stock photography, no fake footage.
 */
export function Still({
  id,
  type,
  accent,
  src,
  alt,
  className,
  ratio = '16 / 9',
  children,
}: {
  id: string;
  type: ProjectType;
  accent: string | null;
  src?: string | null;
  alt: string;
  className?: string;
  ratio?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn('relative overflow-hidden bg-[#0d0f0e]', className)}
      style={{ aspectRatio: ratio }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external stills
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
        />
      ) : (
        <GradedFrame seed={id} type={type} accent={accent ?? '#7fd1b9'} label={alt} />
      )}
      {children}
    </div>
  );
}

function GradedFrame({
  seed,
  type,
  accent,
  label,
}: {
  seed: string;
  type: ProjectType;
  accent: string;
  label: string;
}) {
  const h = hashString(seed);
  const r = (n: number) => ((h >>> (n % 24)) % 1000) / 1000;
  const uid = `g${h.toString(36)}`;
  const sunX = 40 + r(1) * 80;
  const horizon = 52 + r(3) * 14;

  return (
    <svg
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
      role="img"
      aria-label={`Graded frame for ${label}`}
    >
      <defs>
        <radialGradient id={`${uid}-key`} cx={sunX / 160} cy={horizon / 90 - 0.08} r="0.75">
          <stop offset="0" stopColor={accent} stopOpacity="0.85" />
          <stop offset="0.35" stopColor={accent} stopOpacity="0.28" />
          <stop offset="1" stopColor="#060707" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#07090a" />
          <stop offset="1" stopColor="#141816" />
        </linearGradient>
        <linearGradient id={`${uid}-vig`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.7" />
        </linearGradient>
        <filter id={`${uid}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed={h % 97} />
          <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.09 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <rect width="160" height="90" fill={`url(#${uid}-sky)`} />
      <rect width="160" height="90" fill={`url(#${uid}-key)`} />
      <Motif type={type} accent={accent} horizon={horizon} r={r} sunX={sunX} />
      <rect width="160" height="90" fill={`url(#${uid}-vig)`} />
      <rect width="160" height="90" filter={`url(#${uid}-grain)`} />
    </svg>
  );
}

function Motif({
  type,
  accent,
  horizon,
  r,
  sunX,
}: {
  type: ProjectType;
  accent: string;
  horizon: number;
  r: (n: number) => number;
  sunX: number;
}) {
  const ground = (
    <rect x="0" y={horizon} width="160" height={90 - horizon} fill="#050606" opacity="0.85" />
  );
  switch (type) {
    case 'PRODUCT_VIDEO':
    case 'PRODUCT_DEMO': {
      // Hero product on a plinth under a single key light.
      const cx = 60 + r(5) * 40;
      return (
        <g>
          <polygon
            points={`${cx - 26},0 ${cx + 26},0 ${cx + 14},62 ${cx - 14},62`}
            fill={accent}
            opacity="0.07"
          />
          <ellipse cx={cx} cy="64" rx="22" ry="3.5" fill="#000" opacity="0.6" />
          <rect
            x={cx - 9}
            y="40"
            width="18"
            height="24"
            rx="5"
            fill="#1b201e"
            stroke={accent}
            strokeOpacity="0.55"
            strokeWidth="0.5"
          />
          <rect x={cx - 6} y="44" width="3" height="16" rx="1.5" fill={accent} opacity="0.35" />
          <rect x="0" y="64" width="160" height="26" fill="#040505" opacity="0.9" />
        </g>
      );
    }
    case 'CORPORATE_VIDEO':
    case 'EXPLAINER': {
      // Office windows at dusk.
      const cells = [];
      for (let x = 0; x < 9; x++)
        for (let y = 0; y < 5; y++) {
          const lit = r(x * 5 + y) > 0.45;
          cells.push(
            <rect
              key={`${x}-${y}`}
              x={18 + x * 14}
              y={14 + y * 10}
              width="10"
              height="6.5"
              fill={lit ? accent : '#1a1e1c'}
              opacity={lit ? 0.35 + r(x + y) * 0.4 : 0.6}
            />,
          );
        }
      return (
        <g>
          {cells}
          {ground}
        </g>
      );
    }
    case 'SOCIAL_REEL':
    case 'CAMPAIGN': {
      // Vertical neon strips — a reel frame inside the landscape frame.
      return (
        <g>
          {[0, 1, 2, 3, 4].map((i) => (
            <rect
              key={i}
              x={34 + i * 21}
              y={10 + r(i) * 18}
              width="2"
              height={46 + r(i + 3) * 20}
              rx="1"
              fill={accent}
              opacity={0.25 + r(i + 7) * 0.55}
            />
          ))}
          <rect
            x="62"
            y="8"
            width="36"
            height="66"
            rx="4"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.18"
            strokeWidth="0.6"
          />
          {ground}
        </g>
      );
    }
    case 'REAL_ESTATE':
    case 'AERIAL': {
      // Skyline silhouette from above the river.
      const towers = [];
      let x = 0;
      for (let i = 0; x < 160; i++) {
        const w = 6 + r(i) * 12;
        const hgt = 10 + r(i + 4) * 34;
        towers.push(
          <rect key={i} x={x} y={horizon - hgt} width={w - 1} height={hgt} fill="#070909" />,
        );
        x += w;
      }
      return (
        <g>
          {towers}
          <rect x="0" y={horizon} width="160" height={90 - horizon} fill={accent} opacity="0.08" />
          <line
            x1="0"
            y1={horizon + 6}
            x2="160"
            y2={horizon + 6}
            stroke={accent}
            strokeOpacity="0.25"
            strokeWidth="0.4"
          />
        </g>
      );
    }
    case 'STORYTELLING_AD':
    case 'EVENT_COVERAGE': {
      // A lone figure on the horizon, with rain.
      return (
        <g>
          {ground}
          {Array.from({ length: 28 }, (_, i) => (
            <line
              key={i}
              x1={(i * 37) % 160}
              y1={(i * 13) % 50}
              x2={((i * 37) % 160) - 3}
              y2={((i * 13) % 50) + 9}
              stroke="#cfe"
              strokeOpacity="0.12"
              strokeWidth="0.35"
            />
          ))}
          <rect x={sunX - 1.6} y={horizon - 11} width="3.2" height="11" rx="1.4" fill="#030404" />
          <circle cx={sunX} cy={horizon - 12.5} r="2" fill="#030404" />
        </g>
      );
    }
    case 'MOTION_GRAPHICS':
    case 'STUDIO_GREEN_SCREEN':
    case 'PODCAST': {
      return (
        <g fill="none" stroke={accent} strokeOpacity="0.45" strokeWidth="0.6">
          <circle cx="80" cy="45" r="18" />
          <circle cx="80" cy="45" r="28" strokeOpacity="0.2" />
          <rect
            x="52"
            y="17"
            width="56"
            height="56"
            strokeOpacity="0.15"
            transform="rotate(45 80 45)"
          />
        </g>
      );
    }
    case 'BRAND_FILM':
    default: {
      // Sun low over a horizon; hands-and-loom warmth through the grade.
      return (
        <g>
          <circle cx={sunX} cy={horizon - 4} r="9" fill={accent} opacity="0.55" />
          {ground}
          {Array.from({ length: 12 }, (_, i) => (
            <line
              key={i}
              x1={i * 14}
              y1={horizon}
              x2={sunX}
              y2="90"
              stroke={accent}
              strokeOpacity="0.06"
              strokeWidth="0.5"
            />
          ))}
        </g>
      );
    }
  }
}
