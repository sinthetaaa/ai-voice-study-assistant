import type { CookieOptions, Request, Response } from 'express';

import { AUTH_SESSION_COOKIE_NAME } from './auth.constants';

export function getSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  for (const rawPart of cookieHeader.split(';')) {
    const part = rawPart.trim();

    const separatorIndex = part.indexOf('=');

    if (separatorIndex < 0) {
      continue;
    }

    const name = part.slice(0, separatorIndex).trim();

    if (name !== AUTH_SESSION_COOKIE_NAME) {
      continue;
    }

    const rawValue = part.slice(separatorIndex + 1).trim();

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

function baseCookieOptions(production: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: production,
    path: '/',
  };
}

export function setSessionCookie(
  response: Response,
  token: string,
  expiresAt: Date,
  production: boolean,
) {
  response.cookie(AUTH_SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions(production),
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: Response, production: boolean) {
  response.clearCookie(AUTH_SESSION_COOKIE_NAME, baseCookieOptions(production));
}
