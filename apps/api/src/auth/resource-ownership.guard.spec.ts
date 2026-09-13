/* eslint-disable @typescript-eslint/no-require-imports */

import {
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import type { CanActivate } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';

import { type ResourceOwnershipRequirement } from './resource-ownership.decorator';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type ResourceOwnershipGuardConstructor = new (
  reflector: Reflector,
  prisma: PrismaService,
) => CanActivate;

const { ResourceOwnershipGuard } = require('./resource-ownership.guard') as {
  ResourceOwnershipGuard: ResourceOwnershipGuardConstructor;
};

import type { AuthenticatedRequest } from './session-auth.guard';

describe('ResourceOwnershipGuard', () => {
  const handler = () => undefined;
  class TestController {}

  let getAllAndOverride: jest.Mock;

  let prisma: {
    studyPack: {
      findFirst: jest.Mock;
    };

    studySession: {
      findFirst: jest.Mock;
    };

    answerEvaluation: {
      findFirst: jest.Mock;
    };
  };

  let guard: CanActivate;

  beforeEach(() => {
    getAllAndOverride = jest.fn();

    prisma = {
      studyPack: {
        findFirst: jest.fn(),
      },

      studySession: {
        findFirst: jest.fn(),
      },

      answerEvaluation: {
        findFirst: jest.fn(),
      },
    };

    guard = new ResourceOwnershipGuard(
      {
        getAllAndOverride,
      } as unknown as Reflector,

      prisma as unknown as PrismaService,
    );
  });

  function contextFor(
    params: Record<string, string>,
    userId: string | null = 'user-1',
  ): ExecutionContext {
    const request = {
      params,

      authUser: userId
        ? {
            id: userId,
            email: `${userId}@example.com`,
            name: null,
          }
        : undefined,
    } as unknown as AuthenticatedRequest;

    return {
      getHandler: () => handler,

      getClass: () => TestController,

      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  function requireOwnership(requirement?: ResourceOwnershipRequirement) {
    getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(requirement);
  }

  it('allows routes without ownership metadata', async () => {
    requireOwnership(undefined);

    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);

    expect(prisma.studyPack.findFirst).not.toHaveBeenCalled();
    expect(prisma.studySession.findFirst).not.toHaveBeenCalled();
    expect(prisma.answerEvaluation.findFirst).not.toHaveBeenCalled();
  });

  it('allows public routes without ownership checks', async () => {
    getAllAndOverride.mockReturnValueOnce(true);

    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);

    expect(getAllAndOverride).toHaveBeenCalledTimes(1);
  });

  it('allows an owned Study Pack', async () => {
    requireOwnership({
      resource: 'STUDY_PACK',
      param: 'studyPackId',
    });

    prisma.studyPack.findFirst.mockResolvedValue({
      id: 'pack-1',
    });

    await expect(
      guard.canActivate(
        contextFor({
          studyPackId: 'pack-1',
        }),
      ),
    ).resolves.toBe(true);

    expect(prisma.studyPack.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'pack-1',
        ownerId: 'user-1',
      },
      select: {
        id: true,
      },
    });
  });

  it('hides a foreign Study Pack as not found', async () => {
    requireOwnership({
      resource: 'STUDY_PACK',
      param: 'studyPackId',
    });

    prisma.studyPack.findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        contextFor({
          studyPackId: 'foreign-pack',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('authorizes Study Sessions through their Study Pack owner', async () => {
    requireOwnership({
      resource: 'STUDY_SESSION',
      param: 'sessionId',
    });

    prisma.studySession.findFirst.mockResolvedValue({
      id: 'session-1',
    });

    await expect(
      guard.canActivate(
        contextFor({
          sessionId: 'session-1',
        }),
      ),
    ).resolves.toBe(true);

    expect(prisma.studySession.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        studyPack: {
          ownerId: 'user-1',
        },
      },
      select: {
        id: true,
      },
    });
  });

  it('authorizes evaluations through question, concept, and Study Pack ownership', async () => {
    requireOwnership({
      resource: 'EVALUATION',
      param: 'evaluationId',
    });

    prisma.answerEvaluation.findFirst.mockResolvedValue({
      id: 'evaluation-1',
    });

    await expect(
      guard.canActivate(
        contextFor({
          evaluationId: 'evaluation-1',
        }),
      ),
    ).resolves.toBe(true);

    expect(prisma.answerEvaluation.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'evaluation-1',
        attempt: {
          question: {
            concept: {
              studyPack: {
                ownerId: 'user-1',
              },
            },
          },
        },
      },
      select: {
        id: true,
      },
    });
  });

  it('hides a foreign Study Session as not found', async () => {
    requireOwnership({
      resource: 'STUDY_SESSION',
      param: 'sessionId',
    });

    prisma.studySession.findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        contextFor({
          sessionId: 'foreign-session',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides a foreign evaluation as not found', async () => {
    requireOwnership({
      resource: 'EVALUATION',
      param: 'evaluationId',
    });

    prisma.answerEvaluation.findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        contextFor({
          evaluationId: 'foreign-evaluation',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects ownership checks without an authenticated user', async () => {
    requireOwnership({
      resource: 'STUDY_PACK',
      param: 'studyPackId',
    });

    await expect(
      guard.canActivate(
        contextFor(
          {
            studyPackId: 'pack-1',
          },
          null,
        ),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
