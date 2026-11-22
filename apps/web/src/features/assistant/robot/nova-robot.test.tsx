import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NovaRobot } from './nova-robot';
import { deriveRobotState } from './state';

describe('deriveRobotState', () => {
  const base = { flash: null, listening: false, busy: false, speaking: false } as const;

  it('is idle with nothing happening', () => {
    expect(deriveRobotState(base)).toBe('idle');
  });

  it('ranks error > listening > processing > speaking > success', () => {
    expect(deriveRobotState({ ...base, flash: 'error', listening: true })).toBe('error');
    expect(deriveRobotState({ ...base, listening: true, busy: true })).toBe('listening');
    expect(deriveRobotState({ ...base, busy: true, speaking: true })).toBe('processing');
    expect(deriveRobotState({ ...base, speaking: true, flash: 'success' })).toBe('speaking');
    expect(deriveRobotState({ ...base, flash: 'success' })).toBe('success');
  });

  it('shows a microphone check as work in progress, below listening', () => {
    expect(deriveRobotState({ ...base, checking: true })).toBe('processing');
    expect(deriveRobotState({ ...base, checking: true, listening: true })).toBe('listening');
  });
});

describe('NovaRobot', () => {
  it('exposes its state and an accessible name when titled', () => {
    render(<NovaRobot state="listening" title="NOVA — Listening" />);
    const img = screen.getByRole('img', { name: 'NOVA — Listening' });
    expect(img).toHaveAttribute('data-state', 'listening');
  });

  it('is decorative without a title, and instances do not share gradient ids', () => {
    const { container } = render(
      <>
        <NovaRobot state="idle" />
        <NovaRobot state="idle" still />
      </>,
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs[0]).toHaveAttribute('aria-hidden', 'true');
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('feeds the live level into a CSS variable while speaking', async () => {
    const { container } = render(<NovaRobot state="speaking" getLevel={() => 0.5} />);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 30));
    expect((container.querySelector('svg') as SVGElement).style.getPropertyValue('--level')).toBe(
      '0.500',
    );
  });
});
