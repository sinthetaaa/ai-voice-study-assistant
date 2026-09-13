import { createHash, randomBytes } from 'node:crypto';

import { AUTH_SESSION_TTL_MS } from './auth.constants';

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSessionExpiry(now = new Date()): Date {
  return new Date(now.getTime() + AUTH_SESSION_TTL_MS);
}
