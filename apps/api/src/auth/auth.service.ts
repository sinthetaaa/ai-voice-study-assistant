import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';

import { hashPassword, verifyPassword } from './password';

import {
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
} from './session-token';

import { LoginDto } from './dto/login.dto';

import { RegisterDto } from './dto/register.dto';

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
};

export type AuthResult = {
  user: AuthUser;
  sessionToken: string;
  expiresAt: Date;
};

const AUTH_USER_SELECT = {
  id: true,
  email: true,
  name: true,
} as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeName(name: string | undefined): string | null {
  const normalized = name?.trim() ?? '';

  return normalized.length > 0 ? normalized : null;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  return (error as { code?: unknown }).code === 'P2002';
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = normalizeEmail(dto.email);

    const passwordHash = await hashPassword(dto.password);

    const sessionToken = createSessionToken();

    const tokenHash = hashSessionToken(sessionToken);

    const expiresAt = createSessionExpiry();

    const userId = randomUUID();

    try {
      const [user] = await this.prisma.$transaction([
        this.prisma.user.create({
          data: {
            id: userId,
            email,
            name: normalizeName(dto.name),
            passwordHash,
          },
          select: AUTH_USER_SELECT,
        }),

        this.prisma.authSession.create({
          data: {
            userId,
            tokenHash,
            expiresAt,
          },
          select: {
            id: true,
          },
        }),
      ]);

      return {
        user,
        sessionToken,
        expiresAt,
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }

      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const email = normalizeEmail(dto.email);

    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        ...AUTH_USER_SELECT,
        passwordHash: true,
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await verifyPassword(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const sessionToken = createSessionToken();

    const tokenHash = hashSessionToken(sessionToken);

    const expiresAt = createSessionExpiry();

    await this.prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      sessionToken,
      expiresAt,
    };
  }

  async getCurrentUser(sessionToken: string | null): Promise<AuthUser> {
    if (!sessionToken) {
      throw new UnauthorizedException('Authentication required');
    }

    const tokenHash = hashSessionToken(sessionToken);

    const session = await this.prisma.authSession.findUnique({
      where: {
        tokenHash,
      },
      select: {
        id: true,
        expiresAt: true,
        user: {
          select: AUTH_USER_SELECT,
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Authentication required');
    }

    const now = new Date();

    if (session.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.authSession.deleteMany({
        where: {
          id: session.id,
        },
      });

      throw new UnauthorizedException('Authentication required');
    }

    await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
      },
      data: {
        lastUsedAt: now,
      },
    });

    return session.user;
  }

  async logout(sessionToken: string | null): Promise<void> {
    if (!sessionToken) {
      return;
    }

    await this.prisma.authSession.deleteMany({
      where: {
        tokenHash: hashSessionToken(sessionToken),
      },
    });
  }
}
