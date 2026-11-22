import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ProjectType } from '../constants/enums';
import { date, optionalDate, optionalId, rupees, text, wholeNumber } from './common';
import { CreateLead, CreateShoot, CreateTask, UpdateProject } from './requests';

const messages = (result: { success: boolean; error?: z.ZodError }) =>
  result.error?.issues.map((i) => i.message) ?? [];

describe('date', () => {
  it('accepts ISO strings, form dates and Date objects', () => {
    expect(date.parse('2026-11-25T10:00:00.000Z')).toBeInstanceOf(Date);
    expect(date.parse('2026-11-25').toISOString()).toBe('2026-11-25T00:00:00.000Z');
    expect(date.parse(new Date(0)).getTime()).toBe(0);
  });

  it('rejects values that plain coercion would turn into 1970', () => {
    for (const bad of [null, true, false, 0, 5, '', '   ', 'not a date', {}]) {
      const result = date.safeParse(bad);
      expect(result.success, `accepted ${JSON.stringify(bad)}`).toBe(false);
    }
    // An empty value is "required"; a present but unusable one is "invalid".
    expect(messages(date.safeParse(''))).toEqual(['This field is required.']);
    expect(messages(date.safeParse('not a date'))).toEqual(['Enter a valid date.']);
  });
});

describe('optional form values', () => {
  it('reads an empty select or date input as "not set"', () => {
    expect(optionalId.parse('')).toBeUndefined();
    expect(optionalId.parse(undefined)).toBeUndefined();
    expect(optionalId.parse('abc123')).toBe('abc123');
    expect(optionalDate.parse('')).toBeUndefined();
    expect(optionalDate.parse('2026-12-01')).toBeInstanceOf(Date);
  });

  it('lets a task be created with assignee, due date and estimate left blank', () => {
    const task = CreateTask.parse({
      projectId: 'p1',
      title: 'Grade the film',
      assigneeId: '',
      dueDate: '',
      estimateHours: '',
      projectStageId: '',
    });
    expect(task.assigneeId).toBeUndefined();
    expect(task.dueDate).toBeUndefined();
    expect(task.estimateHours).toBeUndefined();
    expect(task.projectStageId).toBeUndefined();
  });
});

describe('amounts', () => {
  it('never reads an empty input as zero', () => {
    expect(rupees().safeParse('').success).toBe(false);
    expect(messages(rupees().safeParse(''))).toContain('Enter an amount.');
    expect(rupees().parse('2500')).toBe(2500);
    expect(rupees().parse(0)).toBe(0);
    expect(rupees(1).safeParse(0).success).toBe(false);
    expect(wholeNumber(1, 120).safeParse('1.5').success).toBe(false);
    expect(wholeNumber(1, 120).safeParse('abc').success).toBe(false);
  });

  it('requires an estimated value on a lead', () => {
    const lead = {
      title: 'Film',
      prospectName: 'Acme',
      projectType: 'BRAND_FILM',
      source: 'WEBSITE',
    };
    expect(CreateLead.safeParse({ ...lead, estimatedValue: '' }).success).toBe(false);
    expect(CreateLead.parse({ ...lead, estimatedValue: '150000', clientId: '' }).clientId).toBe(
      undefined,
    );
  });
});

describe('messages are written for people', () => {
  it('says a required field is required', () => {
    expect(messages(text(80).safeParse(''))).toEqual(['This field is required.']);
    expect(messages(text(80).safeParse(undefined))).toEqual(['This field is required.']);
    expect(messages(text(3).safeParse('abcd'))).toEqual(['Use 3 characters or fewer.']);
  });

  it('asks for a choice instead of listing enum members', () => {
    expect(messages(ProjectType.safeParse(''))).toEqual(['Choose an option.']);
    expect(messages(ProjectType.safeParse('NOPE'))).toEqual(['Choose one of the listed options.']);
  });

  it('distinguishes a missing email from a malformed one', () => {
    expect(messages(z.email().safeParse(''))).toEqual(['This field is required.']);
    expect(messages(z.email().safeParse('nope'))).toEqual(['Enter a valid email address.']);
  });
});

describe('request rules', () => {
  it('does not let an edit mark a project delivered', () => {
    expect(UpdateProject.safeParse({ status: 'DELIVERED' }).success).toBe(false);
    expect(UpdateProject.safeParse({ status: 'ON_HOLD' }).success).toBe(true);
  });

  it('accepts only real clock times for a crew call', () => {
    const shoot = {
      projectId: 'p1',
      title: 'Day 1',
      location: 'Studio A',
      city: 'KOZHIKODE',
      startsAt: '2026-12-01T03:30:00.000Z',
      endsAt: '2026-12-01T12:30:00.000Z',
    };
    expect(CreateShoot.safeParse({ ...shoot, callTime: '06:30' }).success).toBe(true);
    expect(CreateShoot.safeParse({ ...shoot, callTime: '' }).success).toBe(true);
    expect(CreateShoot.safeParse({ ...shoot, callTime: '99:99' }).success).toBe(false);
    expect(CreateShoot.safeParse({ ...shoot, callTime: '24:00' }).success).toBe(false);
  });
});
