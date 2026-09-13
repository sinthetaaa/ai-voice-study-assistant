import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateStudyPackDto } from './dto/create-study-pack.dto';

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

@Injectable()
export class StudyPacksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStudyPackDto, ownerId: string) {
    return this.prisma.studyPack.create({
      data: {
        name: dto.name,
        description: dto.description,
        goal: dto.goal,
        ownerId,
      },
      include: {
        documents: true,
      },
    });
  }

  async claimLegacyPacks(userId: string): Promise<{ claimedCount: number }> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const unownedPackCount = await transaction.studyPack.count({
            where: {
              ownerId: null,
            },
          });

          if (unownedPackCount === 0) {
            return {
              claimedCount: 0,
            };
          }

          const userCount = await transaction.user.count();

          if (userCount !== 1) {
            throw new ConflictException(
              'Legacy Study Packs can only be claimed while exactly one user exists',
            );
          }

          const result = await transaction.studyPack.updateMany({
            where: {
              ownerId: null,
            },
            data: {
              ownerId: userId,
            },
          });

          if (result.count !== unownedPackCount) {
            throw new ConflictException(
              'Legacy Study Pack claim state changed. Please retry',
            );
          }

          return {
            claimedCount: result.count,
          };
        },
        {
          isolationLevel: 'Serializable',
        },
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      if (hasPrismaErrorCode(error, 'P2034')) {
        throw new ConflictException(
          'Legacy Study Pack claim state changed. Please retry',
        );
      }

      throw error;
    }
  }

  async findAll(ownerId: string) {
    return this.prisma.studyPack.findMany({
      where: {
        ownerId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        _count: {
          select: {
            documents: true,
          },
        },
      },
    });
  }

  async findOne(id: string, ownerId: string) {
    const studyPack = await this.prisma.studyPack.findFirst({
      where: {
        id,
        ownerId,
      },
      include: {
        documents: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!studyPack) {
      throw new NotFoundException(`Study pack ${id} was not found`);
    }

    return studyPack;
  }
}
