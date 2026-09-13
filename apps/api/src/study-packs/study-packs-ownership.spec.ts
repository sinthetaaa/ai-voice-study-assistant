/* eslint-disable @typescript-eslint/no-require-imports */

import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { StudyPacksService } =
  require('./study-packs.service') as typeof import('./study-packs.service');

describe('StudyPacksService ownership', () => {
  it('assigns a newly created Study Pack to the authenticated user', async () => {
    const prisma = {
      studyPack: {
        create: jest.fn().mockResolvedValue({
          id: 'pack-1',
          ownerId: 'user-1',
          name: 'Algorithms',
        }),
      },
    };

    const service = new StudyPacksService(prisma as unknown as PrismaService);

    await service.create(
      {
        name: 'Algorithms',
      },
      'user-1',
    );

    expect(prisma.studyPack.create).toHaveBeenCalledWith({
      data: {
        name: 'Algorithms',
        description: undefined,
        goal: undefined,
        ownerId: 'user-1',
      },
      include: {
        documents: true,
      },
    });
  });

  it('lists only Study Packs owned by the authenticated user', async () => {
    const prisma = {
      studyPack: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const service = new StudyPacksService(prisma as unknown as PrismaService);

    await service.findAll('user-1');

    expect(prisma.studyPack.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerId: 'user-1',
        },
      }),
    );
  });

  it('reads a Study Pack only when both id and owner match', async () => {
    const prisma = {
      studyPack: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pack-1',
          ownerId: 'user-1',
          documents: [],
        }),
      },
    };

    const service = new StudyPacksService(prisma as unknown as PrismaService);

    await service.findOne('pack-1', 'user-1');

    expect(prisma.studyPack.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'pack-1',
          ownerId: 'user-1',
        },
      }),
    );
  });

  it('returns not found instead of exposing another users Study Pack', async () => {
    const prisma = {
      studyPack: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new StudyPacksService(prisma as unknown as PrismaService);

    await expect(
      service.findOne('pack-owned-by-someone-else', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
