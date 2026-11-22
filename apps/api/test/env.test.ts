import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/nova' };

describe('WEB_ORIGIN', () => {
  it('defaults to the standard web port', () => {
    expect(loadEnv({ ...base }).WEB_ORIGIN).toEqual(['http://localhost:3100']);
  });

  it('accepts several comma-separated origins and normalises them', () => {
    expect(
      loadEnv({ ...base, WEB_ORIGIN: 'http://localhost:3000/, http://localhost:3100' }).WEB_ORIGIN,
    ).toEqual(['http://localhost:3000', 'http://localhost:3100']);
  });

  it('rejects an entry that is not a URL', () => {
    expect(() => loadEnv({ ...base, WEB_ORIGIN: 'http://localhost:3000,nope' })).toThrow(
      /Not a URL: nope/,
    );
  });
});
