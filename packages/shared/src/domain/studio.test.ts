import { describe, expect, it } from 'vitest';
import {
  breakdownScript,
  budgetGroupOf,
  budgetVariance,
  renderTemplate,
  scoreCrew,
  scoreTalent,
  shootDayKeys,
  shootDayNumber,
  shootReadiness,
} from './studio';

describe('shoot days (IST)', () => {
  it('counts every calendar day a multi-day shoot touches', () => {
    // 06:00 IST on 1 Dec to 18:00 IST on 3 Dec.
    const keys = shootDayKeys('2026-12-01T00:30:00Z', '2026-12-03T12:30:00Z');
    expect(keys).toEqual(['2026-12-01', '2026-12-02', '2026-12-03']);
    expect(
      shootDayNumber(
        { startsAt: '2026-12-01T00:30:00Z', endsAt: '2026-12-03T12:30:00Z' },
        '2026-12-02',
      ),
    ).toEqual({ day: 2, of: 3 });
    expect(
      shootDayNumber(
        { startsAt: '2026-12-01T00:30:00Z', endsAt: '2026-12-03T12:30:00Z' },
        '2026-12-05',
      ),
    ).toBeNull();
  });
  it('a one-day shoot is one day', () => {
    expect(shootDayKeys('2026-12-01T03:00:00Z', '2026-12-01T13:00:00Z')).toHaveLength(1);
  });
});

describe('templates', () => {
  it('fills placeholders and reports the missing ones', () => {
    const r = renderTemplate('Hi {{contact}}, link: {{reviewLink}}', { contact: 'Asha' });
    expect(r.text).toBe('Hi Asha, link: [reviewLink]');
    expect(r.missing).toEqual(['reviewLink']);
  });
});

describe('rule-based breakdown', () => {
  it('reads screenplay headings, characters, props and equipment cues', () => {
    const r = breakdownScript(
      '1. INT. KITCHEN - NIGHT\nMEERA (30) pours COFFEE into a cup.\n\nMEERA\nMorning.\n\n2. EXT. BEACH - DAY\nAerial drone reveal. Slow motion splash.',
    );
    expect(r.method).toBe('RULE_BASED');
    expect(r.scenes).toHaveLength(2);
    expect(r.scenes[0]).toMatchObject({
      number: '1',
      setting: 'INT',
      timeOfDay: 'NIGHT',
      location: 'KITCHEN',
    });
    expect(r.scenes[0]!.characters).toEqual(['Meera']);
    expect(r.scenes[0]!.props).toEqual(expect.arrayContaining(['coffee', 'cup']));
    expect(r.scenes[0]!.equipment).toContain('Night lighting package');
    expect(r.scenes[1]!.equipment).toEqual(
      expect.arrayContaining(['Drone', 'High-frame-rate camera']),
    );
    expect(r.scenes[1]!.requirements).toMatch(/Drone permission/);
  });
  it('reads "Scene N:" outlines and warns when there are no headings', () => {
    expect(
      breakdownScript('Scene 1: Assembly\nStudents arrive.\n\nScene 2: Lab\nInterview.').scenes,
    ).toHaveLength(2);
    const flat = breakdownScript('Just a paragraph of copy.');
    expect(flat.scenes).toHaveLength(1);
    expect(flat.warnings[0]).toMatch(/No scene headings/);
  });
});

describe('recommendation scoring', () => {
  const base = {
    kind: 'ACTOR' as const,
    skills: ['Nurse', 'Drama'],
    languages: ['Malayalam'],
    experienceYears: 8,
    baseCity: 'Kozhikode',
    willTravel: true,
    dayRate: 10000,
    playingAgeMin: 25,
    playingAgeMax: 40,
    isActive: true,
    clashes: [],
    sameTypeBookings: 1,
    sameClientBookings: 0,
  };
  it('explains every point and blocks on clashes', () => {
    const s = scoreTalent(base, {
      role: 'Nurse',
      city: 'Kozhikode',
      age: 30,
      language: 'Malayalam',
    });
    expect(s.blockers).toEqual([]);
    expect(s.score).toBeGreaterThan(60);
    expect(s.reasons.map((r) => r.label).join(' ')).toMatch(/Skills match/);
    const busy = scoreTalent({ ...base, clashes: ['Booked elsewhere'] }, { role: 'Nurse' });
    expect(busy.blockers).toContain('Booked elsewhere');
    expect(scoreTalent(base, { role: 'Nurse', age: 60 }).blockers[0]).toMatch(/Playing age/);
  });
  it('treats Director of Photography as camera, not direction', () => {
    const dop = {
      title: 'Director of Photography',
      skills: ['Lighting'],
      baseLocation: 'KOZHIKODE',
      isActive: true,
      utilisation: 0.3,
      clashes: [],
      sameTypeProjects: 0,
    };
    expect(scoreCrew(dop, { role: 'DOP' }).score).toBeGreaterThan(
      scoreCrew(dop, { role: 'Director' }).score,
    );
  });
});

describe('shoot readiness', () => {
  const ready = {
    location: 'Studio A',
    crewCount: 3,
    hasDirector: true,
    hasCamera: true,
    equipmentCount: 2,
    conflictCount: 0,
    productionManager: true,
    scripts: { total: 1, approved: 1 },
    scenesPlanned: 2,
    uncastCharacters: [],
    talentOnHold: 0,
    callSheetPublished: true,
    checklistOpen: 0,
  };
  it('allows confirming and starting a ready shoot', () => {
    expect(shootReadiness(ready)).toMatchObject({ canConfirm: true, canStart: true, score: 100 });
  });
  it('blocks on an unapproved script, missing crew, conflicts and uncast parts', () => {
    expect(shootReadiness({ ...ready, scripts: { total: 1, approved: 0 } }).canConfirm).toBe(false);
    expect(shootReadiness({ ...ready, crewCount: 0 }).canConfirm).toBe(false);
    expect(shootReadiness({ ...ready, conflictCount: 1 }).canConfirm).toBe(false);
    expect(shootReadiness({ ...ready, uncastCharacters: ['Mother'] }).canConfirm).toBe(false);
    expect(shootReadiness({ ...ready, callSheetPublished: false })).toMatchObject({
      canConfirm: true,
      canStart: false,
    });
    // A product shoot with no script on file is allowed (warning only).
    expect(shootReadiness({ ...ready, scripts: { total: 0, approved: 0 } }).canConfirm).toBe(true);
  });
});

describe('budget', () => {
  it('groups expense categories and computes variance', () => {
    expect(budgetGroupOf('TALENT')).toBe('ARTIST');
    expect(budgetGroupOf('LOCATION')).toBe('PRODUCTION');
    expect(budgetVariance(100, 120)).toMatchObject({ variance: 20, band: 'OVER' });
    expect(budgetVariance(100, 95).band).toBe('NEAR');
    expect(budgetVariance(100, 50).band).toBe('UNDER');
  });
});
