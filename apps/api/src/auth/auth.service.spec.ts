/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */

import { ConflictException, UnauthorizedException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';

import type { AuthService as AuthServiceType } from './auth.service';

import { hashPassword } from './password';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { AuthService } =
  require('./auth.service') as typeof import('./auth.service');

type MockFn = jest.Mock<unknown, unknown[]>;

type MockPrisma = {
  user: {
    create: MockFn;
    findUnique: MockFn;
  };

  authSession: {
    create: MockFn;
    findUnique: MockFn;
    deleteMany: MockFn;
    updateMany: MockFn;
  };

  $transaction: MockFn;
};

function createMockPrisma(): MockPrisma {
  return {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },

    authSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },

    $transaction: jest.fn(),
  };
}

describe('AuthService', () => {
  let prisma: MockPrisma;
  let service: AuthServiceType;

  beforeEach(() => {
    prisma = createMockPrisma();

    service = new AuthService(prisma as unknown as PrismaService);
  });

  describe('register', () => {
    it('normalizes identity, hashes the password, and creates a session', async () => {
      const user = {
        id: 'user-1',
        email: 'learner@example.com',
        name: 'Learner',
      };

      prisma.user.create.mockReturnValue('create-user-operation');

      prisma.authSession.create.mockReturnValue('create-session-operation');

      prisma.$transaction.mockResolvedValue([
        user,
        {
          id: 'session-1',
        },
      ]);

      const result = await service.register({
        email: '  Learner@Example.COM  ',
        password: 'correct-horse-battery-staple',
        name: '  Learner  ',
      });

      expect(prisma.user.create).toHaveBeenCalledTimes(1);

      const userCreateArgument = prisma.user.create.mock.calls[0][0] as {
        data: {
          id: string;
          email: string;
          name: string | null;
          passwordHash: string;
        };
      };

      expect(userCreateArgument.data.email).toBe('learner@example.com');

      expect(userCreateArgument.data.name).toBe('Learner');

      expect(userCreateArgument.data.id).toEqual(expect.any(String));

      expect(userCreateArgument.data.passwordHash).toMatch(/^scrypt:v1:/);

      expect(userCreateArgument.data.passwordHash).not.toContain(
        'correct-horse-battery-staple',
      );

      expect(prisma.authSession.create).toHaveBeenCalledTimes(1);

      const sessionCreateArgument = prisma.authSession.create.mock
        .calls[0][0] as {
        data: {
          userId: string;
          tokenHash: string;
          expiresAt: Date;
        };
      };

      expect(sessionCreateArgument.data.userId).toBe(
        userCreateArgument.data.id,
      );

      expect(sessionCreateArgument.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);

      expect(sessionCreateArgument.data.expiresAt).toBeInstanceOf(Date);

      expect(prisma.$transaction).toHaveBeenCalledWith([
        'create-user-operation',
        'create-session-operation',
      ]);

      expect(result.user).toEqual(user);

      expect(result.sessionToken).toEqual(expect.any(String));

      expect(result.sessionToken).not.toBe(
        sessionCreateArgument.data.tokenHash,
      );

      expect(result.expiresAt).toEqual(sessionCreateArgument.data.expiresAt);
    });

    it('maps a unique-email conflict to ConflictException', async () => {
      prisma.user.create.mockReturnValue('create-user-operation');

      prisma.authSession.create.mockReturnValue('create-session-operation');

      prisma.$transaction.mockRejectedValue({
        code: 'P2002',
      });

      await expect(
        service.register({
          email: 'duplicate@example.com',
          password: 'correct-horse-battery-staple',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('accepts a valid password and creates a new session', async () => {
      const password = 'correct-horse-battery-staple';

      const passwordHash = await hashPassword(password);

      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'learner@example.com',
        name: 'Learner',
        passwordHash,
      });

      prisma.authSession.create.mockResolvedValue({
        id: 'session-1',
      });

      const result = await service.login({
        email: '  LEARNER@EXAMPLE.COM ',
        password,
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: {
          email: 'learner@example.com',
        },

        select: expect.any(Object),
      });

      expect(prisma.authSession.create).toHaveBeenCalledTimes(1);

      const sessionCreateArgument = prisma.authSession.create.mock
        .calls[0][0] as {
        data: {
          userId: string;
          tokenHash: string;
          expiresAt: Date;
        };
      };

      expect(sessionCreateArgument.data.userId).toBe('user-1');

      expect(sessionCreateArgument.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);

      expect(result.user).toEqual({
        id: 'user-1',
        email: 'learner@example.com',
        name: 'Learner',
      });

      expect(result.sessionToken).not.toBe(
        sessionCreateArgument.data.tokenHash,
      );
    });

    it('uses the same generic error for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'missing@example.com',
          password: 'correct-horse-battery-staple',
        }),
      ).rejects.toMatchObject({
        status: 401,
        message: 'Invalid email or password',
      });

      expect(prisma.authSession.create).not.toHaveBeenCalled();
    });

    it('uses the same generic error for an invalid password', async () => {
      const passwordHash = await hashPassword('correct-horse-battery-staple');

      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'learner@example.com',
        name: null,
        passwordHash,
      });

      await expect(
        service.login({
          email: 'learner@example.com',
          password: 'definitely-not-correct',
        }),
      ).rejects.toMatchObject({
        status: 401,
        message: 'Invalid email or password',
      });

      expect(prisma.authSession.create).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('rejects a missing session token', async () => {
      await expect(service.getCurrentUser(null)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(prisma.authSession.findUnique).not.toHaveBeenCalled();
    });

    it('returns the session user and touches lastUsedAt', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      prisma.authSession.findUnique.mockResolvedValue({
        id: 'session-1',
        expiresAt,
        user: {
          id: 'user-1',
          email: 'learner@example.com',
          name: 'Learner',
        },
      });

      prisma.authSession.updateMany.mockResolvedValue({
        count: 1,
      });

      const user = await service.getCurrentUser('raw-session-token');

      expect(user).toEqual({
        id: 'user-1',
        email: 'learner@example.com',
        name: 'Learner',
      });

      expect(prisma.authSession.findUnique).toHaveBeenCalledWith({
        where: {
          tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        },

        select: expect.any(Object),
      });

      expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'session-1',
        },

        data: {
          lastUsedAt: expect.any(Date),
        },
      });
    });

    it('deletes an expired session and rejects it', async () => {
      prisma.authSession.findUnique.mockResolvedValue({
        id: 'expired-session',
        expiresAt: new Date(Date.now() - 1000),
        user: {
          id: 'user-1',
          email: 'learner@example.com',
          name: null,
        },
      });

      prisma.authSession.deleteMany.mockResolvedValue({
        count: 1,
      });

      await expect(
        service.getCurrentUser('expired-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'expired-session',
        },
      });

      expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the server-side session', async () => {
      prisma.authSession.deleteMany.mockResolvedValue({
        count: 1,
      });

      await service.logout('raw-session-token');

      expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({
        where: {
          tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      });
    });

    it('is idempotent without a cookie', async () => {
      await service.logout(null);

      expect(prisma.authSession.deleteMany).not.toHaveBeenCalled();
    });
  });
});
