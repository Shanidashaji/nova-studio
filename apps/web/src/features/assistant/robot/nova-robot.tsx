'use client';

import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/utils';
import s from './nova-robot.module.css';

export type RobotState = 'idle' | 'listening' | 'processing' | 'speaking' | 'success' | 'error';

export const ROBOT_LABEL: Record<RobotState, string> = {
  idle: 'Ready',
  listening: 'Listening',
  processing: 'Thinking',
  speaking: 'Speaking',
  success: 'Done',
  error: 'Something went wrong',
};

/** Mouth segments: relative response of each bar to the voice level. */
const BARS = [0.9, 1.7, 2.4, 1.7, 0.9];

/**
 * NOVA's robotic figure: a graphite helmet with a glass visor, luminous eyes, ear emitters and a
 * floating collar. Each interaction state changes its expression; while listening or speaking,
 * `getLevel` feeds it a real signal (microphone level / speech progress) through a CSS variable,
 * updated per animation frame without re-rendering React.
 */
export function NovaRobot({
  state,
  size = 96,
  getLevel,
  still,
  title,
  className,
}: {
  state: RobotState;
  size?: number;
  /** 0–1. Read every frame while listening or speaking. */
  getLevel?: () => number;
  /** Static glyph with no motion (message avatars). */
  still?: boolean;
  /** Accessible name; omit to make the figure decorative. */
  title?: string;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `nova-${name}-${uid}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!getLevel || (state !== 'listening' && state !== 'speaking')) {
      el.style.setProperty('--level', '0');
      return;
    }
    let frame = 0;
    const tick = () => {
      el.style.setProperty('--level', getLevel().toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getLevel, state]);

  return (
    <svg
      ref={ref}
      viewBox="0 0 120 132"
      width={size}
      height={(size * 132) / 120}
      data-state={state}
      className={cn(s.root, still && s.still, className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={id('shell')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a5753" />
          <stop offset="0.45" stopColor="#222b29" />
          <stop offset="1" stopColor="#0b100f" />
        </linearGradient>
        <linearGradient id={id('rim')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id={id('visor')} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#0a1714" />
          <stop offset="1" stopColor="#010303" />
        </linearGradient>
        <radialGradient id={id('aura')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className={s.accentStop} stopOpacity="0.32" />
          <stop offset="0.6" className={s.accentStop} stopOpacity="0.08" />
          <stop offset="1" className={s.accentStop} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('scan')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className={s.accentStop} stopOpacity="0" />
          <stop offset="0.5" className={s.accentStop} stopOpacity="0.9" />
          <stop offset="1" className={s.accentStop} stopOpacity="0" />
        </linearGradient>
        <clipPath id={id('visor-clip')}>
          <rect x="29" y="47" width="62" height="38" rx="17" />
        </clipPath>
      </defs>

      {!still ? (
        <>
          <circle cx="60" cy="64" r="58" fill={`url(#${id('aura')})`} className={s.aura} />
          <circle
            cx="60"
            cy="64"
            r="52"
            fill="none"
            strokeWidth="1.2"
            className={cn(s.ring, s.accentStroke)}
          />
          <circle
            cx="60"
            cy="64"
            r="57"
            fill="none"
            strokeWidth="0.8"
            className={cn(s.ring, s.ring2, s.accentStroke)}
          />
          <g className={s.orbit}>
            <circle
              cx="60"
              cy="64"
              r="50"
              fill="none"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeDasharray="22 292"
              className={s.accentStroke}
            />
            <circle cx="60" cy="14" r="2" className={s.accentFill} />
          </g>
          <ellipse cx="60" cy="127" rx="22" ry="2.6" className={cn(s.base, s.accentFill)} />
        </>
      ) : null}

      <g className={s.figure}>
        {/* Collar: a floating shoulder piece with a core light. */}
        <rect x="35" y="106" width="50" height="14" rx="7" fill={`url(#${id('shell')})`} />
        <rect
          x="35.5"
          y="106.5"
          width="49"
          height="13"
          rx="6.5"
          fill="none"
          stroke={`url(#${id('rim')})`}
        />
        <rect x="50" y="99" width="20" height="6" rx="3" fill="#0d1312" />
        <circle cx="60" cy="113" r="2.4" className={cn(s.core, s.accentFill)} />

        <g className={s.head}>
          {/* Antenna */}
          <rect x="58.8" y="22" width="2.4" height="9" rx="1.2" fill="#2b3533" />
          <circle cx="60" cy="20.5" r="3" className={cn(s.node, s.accentFill)} />

          {/* Ear emitters */}
          <rect x="12" y="54" width="10" height="22" rx="5" fill={`url(#${id('shell')})`} />
          <rect x="98" y="54" width="10" height="22" rx="5" fill={`url(#${id('shell')})`} />
          <rect
            x="15.5"
            y="58"
            width="3"
            height="14"
            rx="1.5"
            className={cn(s.ear, s.accentFill)}
          />
          <rect
            x="101.5"
            y="58"
            width="3"
            height="14"
            rx="1.5"
            className={cn(s.ear, s.accentFill)}
          />

          {/* Helmet */}
          <rect x="19" y="30" width="82" height="70" rx="31" fill={`url(#${id('shell')})`} />
          <rect
            x="19.5"
            y="30.5"
            width="81"
            height="69"
            rx="30.5"
            fill="none"
            stroke={`url(#${id('rim')})`}
          />
          <ellipse cx="50" cy="38.5" rx="20" ry="4.5" fill="#ffffff" opacity="0.07" />

          {/* Visor */}
          <rect x="29" y="47" width="62" height="38" rx="17" fill={`url(#${id('visor')})`} />
          <rect
            x="29.5"
            y="47.5"
            width="61"
            height="37"
            rx="16.5"
            fill="none"
            strokeOpacity="0.28"
            className={s.accentStroke}
          />
          <path
            d="M37 53 Q47 49.5 60 50"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.12"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <g clipPath={`url(#${id('visor-clip')})`}>
            <rect
              x="22"
              y="47"
              width="14"
              height="38"
              fill={`url(#${id('scan')})`}
              className={s.scan}
            />
          </g>

          {/* Eyes */}
          {[
            { x: 47, side: s.eyeLeft },
            { x: 73, side: s.eyeRight },
          ].map(({ x, side }) => (
            <g key={x} transform={`translate(${x} 63)`}>
              <g className={cn(s.eye, side)}>
                <rect
                  x="-5.5"
                  y="-7"
                  width="11"
                  height="14"
                  rx="5.5"
                  className={cn(s.eyeShape, s.accentFill)}
                />
                <path
                  d="M-6 2.5 Q0 -6 6 2.5"
                  fill="none"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className={cn(s.happy, s.accentStroke)}
                />
              </g>
            </g>
          ))}

          {/* Mouth */}
          {BARS.map((k, i) => (
            <rect
              key={i}
              x={53.4 + i * 2.9}
              y="74"
              width="1.9"
              height="6"
              rx="0.95"
              className={cn(s.bar, s.accentFill)}
              style={{ '--k': k } as React.CSSProperties}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
