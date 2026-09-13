import { AUTH_SESSION_TTL_MS } from './auth.constants';

import {
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
} from './session-token';

describe('session token helpers', () => {
  it('creates high-entropy opaque tokens', () => {
    const first = createSessionToken();

    const second = createSessionToken();

    expect(first).not.toBe(second);

    expect(first.length).toBeGreaterThan(30);
  });

  it('hashes the raw token with SHA-256', () => {
    const token = createSessionToken();

    const hash = hashSessionToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    expect(hash).not.toBe(token);
  });

  it('creates an absolute session expiry', () => {
    const now = new Date('2026-09-13T12:00:00.000Z');

    const expiry = createSessionExpiry(now);

    expect(expiry.getTime() - now.getTime()).toBe(AUTH_SESSION_TTL_MS);
  });
});
