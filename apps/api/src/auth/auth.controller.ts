import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import type { Request, Response } from 'express';

import { AuthService } from './auth.service';

import {
  clearSessionCookie,
  getSessionCookie,
  setSessionCookie,
} from './auth-cookie';

import { LoginDto } from './dto/login.dto';

import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,

    private readonly configService: ConfigService,
  ) {}

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  @Post('register')
  async register(
    @Body()
    dto: RegisterDto,

    @Res({ passthrough: true })
    response: Response,
  ) {
    const result = await this.authService.register(dto);

    setSessionCookie(
      response,
      result.sessionToken,
      result.expiresAt,
      this.isProduction(),
    );

    return {
      user: result.user,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body()
    dto: LoginDto,

    @Res({ passthrough: true })
    response: Response,
  ) {
    const result = await this.authService.login(dto);

    setSessionCookie(
      response,
      result.sessionToken,
      result.expiresAt,
      this.isProduction(),
    );

    return {
      user: result.user,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req()
    request: Request,

    @Res({ passthrough: true })
    response: Response,
  ): Promise<void> {
    await this.authService.logout(getSessionCookie(request));

    clearSessionCookie(response, this.isProduction());
  }

  @Get('me')
  async me(
    @Req()
    request: Request,
  ) {
    const user = await this.authService.getCurrentUser(
      getSessionCookie(request),
    );

    return {
      user,
    };
  }
}
