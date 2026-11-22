import { useId } from 'react';

/**
 * The masthead artwork: sumi-ink brush strokes, a vermilion sun and a cinematographer at the
 * camera. Pure SVG (no stock imagery), tinted from theme tokens; the rough edges come from a
 * turbulence displacement so the strokes read as brushed rather than vector-clean.
 */
export function HeroArt({ compact = false }: { compact?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `ha-${n}-${uid}`;

  return (
    <svg
      viewBox="0 0 900 340"
      preserveAspectRatio="xMaxYMax meet"
      className="absolute inset-0 size-full"
      aria-hidden
    >
      <defs>
        <filter id={id('brush')} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035 0.09" numOctaves="3" seed="7" />
          <feDisplacementMap
            in="SourceGraphic"
            scale="14"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter id={id('soft')}>
          <feGaussianBlur stdDeviation="18" />
        </filter>
        <radialGradient id={id('sun')} cx="0.42" cy="0.4" r="0.7">
          <stop offset="0" stopColor="var(--brand-2)" />
          <stop offset="0.55" stopColor="var(--brand)" />
          <stop offset="1" stopColor="color-mix(in oklab, var(--brand) 80%, black)" />
        </radialGradient>
        {/* Fades the art into the page on the left (behind the greeting) and at the bottom. */}
        <linearGradient id={id('fadeL')} x1="0" x2="1">
          <stop offset="0" stopColor="var(--bg)" stopOpacity="1" />
          <stop offset={compact ? '0.45' : '0.34'} stopColor="var(--bg)" stopOpacity="0.85" />
          <stop offset={compact ? '0.7' : '0.52'} stopColor="var(--bg)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('fadeB')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.7" stopColor="var(--bg)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--bg)" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* Ink wash */}
      <g fill="var(--text)" filter={`url(#${id('brush')})`}>
        <path
          opacity="0.12"
          d="M900 -10 C 780 40, 640 70, 470 180 C 420 212, 380 250, 360 300 L 430 320 C 470 250, 560 190, 680 140 C 760 108, 840 90, 900 86 Z"
        />
        <path
          opacity="0.5"
          d="M900 30 C 820 60, 760 70, 700 110 C 660 136, 640 160, 620 196 L 650 206 C 690 170, 760 140, 900 118 Z"
        />
        <path
          opacity="0.75"
          d="M880 -10 C 840 30, 790 60, 760 110 L 790 118 C 820 80, 860 50, 900 30 L 900 -10 Z"
        />
        <path
          opacity="0.3"
          d="M520 0 C 600 40, 640 90, 650 160 L 630 162 C 610 100, 570 50, 500 8 Z"
        />
      </g>
      <g fill="var(--text)" filter={`url(#${id('brush')})`}>
        <path
          opacity="0.18"
          d="M440 330 C 560 250, 720 190, 900 170 L 900 214 C 740 230, 600 276, 500 340 Z"
        />
        <path
          opacity="0.1"
          d="M300 310 C 420 276, 520 258, 640 256 L 620 276 C 500 284, 400 304, 320 334 Z"
        />
      </g>

      {/* Vermilion sun with a soft glow */}
      <circle
        cx="590"
        cy="150"
        r="128"
        fill="var(--brand)"
        opacity="0.25"
        filter={`url(#${id('soft')})`}
      />
      <circle
        cx="590"
        cy="150"
        r="112"
        fill={`url(#${id('sun')})`}
        filter={`url(#${id('brush')})`}
      />

      {!compact ? <Cinematographer /> : null}

      {/* Vermilion brush swoosh, lower right */}
      <path
        filter={`url(#${id('brush')})`}
        fill="var(--brand)"
        d="M900 240 C 840 262, 780 300, 740 340 L 800 340 C 830 312, 860 292, 900 280 Z"
      />
      {/* Splatter */}
      <g fill="var(--text)" opacity="0.7">
        {[
          [420, 120, 2.5],
          [455, 90, 1.5],
          [700, 300, 2],
          [860, 200, 3],
          [510, 260, 1.8],
          [760, 40, 1.4],
          [396, 210, 1.2],
        ].map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
        ))}
      </g>
      <g fill="var(--brand)">
        <circle cx="470" cy="70" r="2.4" />
        <circle cx="820" cy="300" r="3" />
        <circle cx="720" cy="250" r="1.6" />
      </g>

      <rect width="900" height="340" fill={`url(#${id('fadeL')})`} />
      <rect width="900" height="340" fill={`url(#${id('fadeB')})`} />
    </svg>
  );
}

/** A camera operator kneeling at a cine camera on a tripod, in silhouette against the sun. */
function Cinematographer() {
  const ink = '#100c0a';
  return (
    <g>
      {/* Tripod */}
      <g stroke={ink} strokeWidth="6" strokeLinecap="round">
        <line x1="700" y1="168" x2="640" y2="336" />
        <line x1="700" y1="168" x2="770" y2="336" />
        <line x1="700" y1="168" x2="704" y2="336" strokeWidth="4" />
      </g>
      <g fill={ink}>
        <rect x="672" y="150" width="56" height="20" rx="4" />
        {/* Camera body, lens and matte box */}
        <rect x="628" y="84" width="112" height="70" rx="7" />
        <rect x="738" y="98" width="46" height="42" rx="4" />
        <path d="M784 88 L830 74 L830 164 L784 150 Z" />
        <rect x="650" y="64" width="72" height="9" rx="3" />
        <rect x="656" y="64" width="7" height="22" />
        <rect x="709" y="64" width="7" height="22" />
        {/* Monitor */}
        <rect x="668" y="34" width="44" height="28" rx="3" />
        <rect x="686" y="60" width="6" height="6" />
        {/* Eyepiece */}
        <rect x="598" y="96" width="34" height="16" rx="4" />
      </g>
      {/* Tally light */}
      <circle cx="730" cy="94" r="3" fill="var(--brand)" />

      {/* Operator */}
      <g fill={ink}>
        <circle cx="574" cy="104" r="21" />
        {/* Cap */}
        <path d="M552 98 C 556 76, 590 72, 600 92 L 612 96 L 610 101 L 552 104 Z" />
        {/* Torso, leaning in */}
        <path d="M534 142 C 548 124, 584 120, 604 134 L 612 220 C 590 230, 548 230, 520 222 C 516 196, 520 164, 534 142 Z" />
      </g>
      <g stroke={ink} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Arm to the camera handle */}
        <path d="M596 140 L628 168 L656 140" strokeWidth="17" />
        {/* Arm to the lens */}
        <path d="M552 150 L580 192 L640 182" strokeWidth="15" />
        {/* Kneeling legs */}
        <path d="M534 218 L580 280 L540 334" strokeWidth="26" />
        <path d="M594 220 L630 276 L622 334" strokeWidth="24" />
      </g>
    </g>
  );
}
