import { describe, expect, it } from 'vitest';
import { duration, money, relativeDay, titleCase } from './format';

describe('format', () => {
  it('formats rupees in the Indian system', () => {
    expect(money(650000)).toBe('₹6.5L');
    expect(money(12_500_000)).toBe('₹1.3Cr');
    expect(money(45000)).toBe('₹45K');
    expect(money(320000, { exact: true })).toBe('₹3,20,000');
  });

  it('shows a dash for an amount the API withheld from this user', () => {
    expect(money(null)).toBe('—');
    expect(money(null, { exact: true })).toBe('—');
    expect(money(0)).toBe('₹0');
  });

  it('describes days relative to now', () => {
    const now = new Date('2026-11-22T06:00:00Z');
    expect(relativeDay('2026-11-22T10:00:00Z', now)).toBe('today');
    expect(relativeDay('2026-11-23T10:00:00Z', now)).toBe('tomorrow');
    expect(relativeDay('2026-11-25T10:00:00Z', now)).toBe('in 3 days');
    expect(relativeDay('2026-11-20T10:00:00Z', now)).toBe('2 days ago');
  });

  it('formats durations and enum labels', () => {
    expect(duration(90)).toBe('1:30');
    expect(duration(20)).toBe('20s');
    expect(titleCase('CHANGES_REQUESTED')).toBe('Changes Requested');
  });
});
