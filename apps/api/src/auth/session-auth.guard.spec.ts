/* eslint-disable @typescript-eslint/no-require-imports */

import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';

import type { Reflector } from '@nestjs/core';

import type { AuthService, AuthUser } from './auth.service';

import { IS_PUBLIC_KEY } from './public.decorator';

jest.mock('./auth.service', () => ({
  AuthService: class AuthService {},
}));

const { SessionAuthGuard } =
  require('./session-auth.guard') as typeof import('./session-auth.guard');

type RequestLike = {
  headers: {
    cookie?: string;
  };

  authUser?: AuthUser;
};

function createContext(request: RequestLike) {
  const handler = function testHandler() {};

  const controller = class TestController {};

  const context = {
    getHandler: () => handler,

    getClass: () => controller,

    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return {
    context,
    handler,
    controller,
  };
}

describe('SessionAuthGuard', () => {
  let getAllAndOverride: jest.Mock;
  let getCurrentUser: jest.Mock;

  let reflector: Reflector;
  let authService: AuthService;

  beforeEach(() => {
    getAllAndOverride = jest.fn();

    getCurrentUser = jest.fn();

    reflector = {
      getAllAndOverride,
    } as unknown as Reflector;

    authService = {
      getCurrentUser,
    } as unknown as AuthService;
  });

  it('bypasses authentication for a public route', async () => {
    getAllAndOverride.mockReturnValue(true);

    const request: RequestLike = {
      headers: {},
    };

    const { context, handler, controller } = createContext(request);

    const guard = new SessionAuthGuard(reflector, authService);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      handler,
      controller,
    ]);

    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it('rejects a protected route without a session cookie', async () => {
    getAllAndOverride.mockReturnValue(false);

    getCurrentUser.mockRejectedValue(
      new UnauthorizedException('Authentication required'),
    );

    const request: RequestLike = {
      headers: {},
    };

    const { context } = createContext(request);

    const guard = new SessionAuthGuard(reflector, authService);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(getCurrentUser).toHaveBeenCalledWith(null);
  });

  it('rejects a protected route with an invalid session cookie', async () => {
    getAllAndOverride.mockReturnValue(false);

    getCurrentUser.mockRejectedValue(
      new UnauthorizedException('Authentication required'),
    );

    const request: RequestLike = {
      headers: {
        cookie: 'studyloop_session=invalid-token',
      },
    };

    const { context } = createContext(request);

    const guard = new SessionAuthGuard(reflector, authService);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(getCurrentUser).toHaveBeenCalledWith('invalid-token');
  });

  it('allows a valid authenticated session', async () => {
    getAllAndOverride.mockReturnValue(false);

    const user: AuthUser = {
      id: 'user-1',
      email: 'learner@example.com',
      name: 'Learner',
    };

    getCurrentUser.mockResolvedValue(user);

    const request: RequestLike = {
      headers: {
        cookie: 'other=value; studyloop_session=raw-session-token',
      },
    };

    const { context } = createContext(request);

    const guard = new SessionAuthGuard(reflector, authService);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(getCurrentUser).toHaveBeenCalledWith('raw-session-token');
  });

  it('attaches the authenticated user to the request', async () => {
    getAllAndOverride.mockReturnValue(false);

    const user: AuthUser = {
      id: 'user-1',
      email: 'learner@example.com',
      name: null,
    };

    getCurrentUser.mockResolvedValue(user);

    const request: RequestLike = {
      headers: {
        cookie: 'studyloop_session=raw-session-token',
      },
    };

    const { context } = createContext(request);

    const guard = new SessionAuthGuard(reflector, authService);

    await guard.canActivate(context);

    expect(request.authUser).toEqual(user);
  });
});
