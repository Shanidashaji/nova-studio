import { describe, expect, it } from 'vitest';
import { extractTaskTitle, findBestMatch, parseDueDate, parseTaskStatus } from './language';

const projects = [
  { id: 'p1', names: ['Woven Light', 'NM-26-031'] },
  { id: 'p2', names: ['Feel the Sound', 'NM-26-032'] },
  { id: 'p3', names: ['Unboxing Reels', 'NM-26-039'] },
];

describe('findBestMatch', () => {
  it('matches full names and codes', () => {
    expect(findBestMatch('what is happening on woven light?', projects)?.id).toBe('p1');
    expect(findBestMatch('status of NM-26-032', projects)?.id).toBe('p2');
  });
  it('matches on meaningful words', () => {
    expect(findBestMatch('how are the unboxing reels doing', projects)?.id).toBe('p3');
  });
  it('refuses to guess on weak overlap', () => {
    expect(findBestMatch('show me the sound design tasks', projects, 0.7)).toBeNull();
  });
});

describe('parseDueDate', () => {
  const sunday = new Date(2026, 10, 22, 10); // Sun 22 Nov 2026

  it('understands relative days', () => {
    expect(parseDueDate('due tomorrow', sunday)?.getDate()).toBe(23);
    expect(parseDueDate('in 3 days', sunday)?.getDate()).toBe(25);
    expect(parseDueDate('by today', sunday)?.getHours()).toBe(18);
  });
  it('resolves weekday names to the next occurrence', () => {
    expect(parseDueDate('by Friday', sunday)?.getDate()).toBe(27);
    expect(parseDueDate('on sunday', sunday)?.getDate()).toBe(29);
  });
  it('reads day-month dates', () => {
    const d = parseDueDate('due 4 Dec', sunday)!;
    expect([d.getDate(), d.getMonth()]).toEqual([4, 11]);
  });
  it('returns null when there is no date', () => {
    expect(parseDueDate('create a task', sunday)).toBeNull();
  });
});

describe('parseTaskStatus', () => {
  it('maps everyday words', () => {
    expect(parseTaskStatus('mark colour grade as done')).toBe('DONE');
    expect(parseTaskStatus('set it to in progress')).toBe('IN_PROGRESS');
    expect(parseTaskStatus('it is blocked')).toBe('BLOCKED');
    expect(parseTaskStatus('hello')).toBeNull();
  });
});

describe('extractTaskTitle', () => {
  it('prefers quoted titles', () => {
    expect(extractTaskTitle('Create a task "Grade the hero film" for Woven Light')).toBe(
      'Grade the hero film',
    );
  });
  it('reads unquoted titles up to the project or due phrase', () => {
    expect(
      extractTaskTitle(
        'create a task to export the cut-downs for the project Woven Light due Friday',
      ),
    ).toBe('Export the cut-downs');
    expect(extractTaskTitle('add task colour grade by tomorrow')).toBe('Colour grade');
  });
  it('returns null without a title', () => {
    expect(extractTaskTitle('create a task')).toBeNull();
  });
});
