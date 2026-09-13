import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import type { Request } from 'express';

import { AuthService, type AuthUser } from './auth.service';

import { getSessionCookie } from './auth-cookie';

import { IS_PUBLIC_KEY } from './public.decorator';

export type AuthenticatedRequest = Request & {
  authUser?: AuthUser;
};

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,

    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const user = await this.authService.getCurrentUser(
      getSessionCookie(request),
    );

    request.authUser = user;

    return true;
  }
}
