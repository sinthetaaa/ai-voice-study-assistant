import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import { PrismaService } from '../prisma/prisma.service';

import { IS_PUBLIC_KEY } from './public.decorator';

import {
  RESOURCE_OWNERSHIP_KEY,
  type ResourceOwnershipRequirement,
} from './resource-ownership.decorator';

import type { AuthenticatedRequest } from './session-auth.guard';

@Injectable()
export class ResourceOwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,

    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requirement =
      this.reflector.getAllAndOverride<ResourceOwnershipRequirement>(
        RESOURCE_OWNERSHIP_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!requirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const userId = request.authUser?.id;

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const resourceId = request.params?.[requirement.param];

    if (typeof resourceId !== 'string' || resourceId.length === 0) {
      throw new Error(`Ownership parameter ${requirement.param} was not found`);
    }

    const owned = await this.isOwned(requirement, resourceId, userId);

    if (!owned) {
      throw new NotFoundException('Resource was not found');
    }

    return true;
  }

  private async isOwned(
    requirement: ResourceOwnershipRequirement,
    resourceId: string,
    userId: string,
  ): Promise<boolean> {
    switch (requirement.resource) {
      case 'STUDY_PACK': {
        const studyPack = await this.prisma.studyPack.findFirst({
          where: {
            id: resourceId,
            ownerId: userId,
          },
          select: {
            id: true,
          },
        });

        return studyPack !== null;
      }

      case 'STUDY_SESSION': {
        const session = await this.prisma.studySession.findFirst({
          where: {
            id: resourceId,
            studyPack: {
              ownerId: userId,
            },
          },
          select: {
            id: true,
          },
        });

        return session !== null;
      }

      case 'EVALUATION': {
        const evaluation = await this.prisma.answerEvaluation.findFirst({
          where: {
            id: resourceId,
            attempt: {
              question: {
                concept: {
                  studyPack: {
                    ownerId: userId,
                  },
                },
              },
            },
          },
          select: {
            id: true,
          },
        });

        return evaluation !== null;
      }
    }
  }
}
