/* eslint-disable @typescript-eslint/no-require-imports */

import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { StudyPacksService } =
  require('./study-packs.service') as typeof import('./study-packs.service');

describe('StudyPacksService metadata update', () => {
  it('updates metadata only for a Study Pack owned by the user', async () => {
    const prisma = {
      studyPack: {
        updateMany: jest.fn().mockResolvedValue({
          count: 1,
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'pack-1',
          ownerId: 'user-1',
          name: 'Renamed Algorithms',
          description: 'Updated description',
          goal: 'Updated goal',
          documents: [],
        }),
      },
    };

    const service = new StudyPacksService(prisma as unknown as PrismaService);

    await service.update('pack-1', 'user-1', {
      name: 'Renamed Algorithms',
      description: 'Updated description',
      goal: 'Updated goal',
    });

    expect(prisma.studyPack.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'pack-1',
        ownerId: 'user-1',
      },
      data: {
        name: 'Renamed Algorithms',
        description: 'Updated description',
        goal: 'Updated goal',
      },
    });

    expect(prisma.studyPack.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'pack-1',
          ownerId: 'user-1',
        },
      }),
    );
  });

  it('allows nullable metadata to be cleared', async () => {
    const prisma = {
      studyPack: {
        updateMany: jest.fn().mockResolvedValue({
          count: 1,
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'pack-1',
          ownerId: 'user-1',
          name: 'Algorithms',
          description: null,
          goal: null,
          documents: [],
        }),
      },
    };

    const service = new StudyPacksService(prisma as unknown as PrismaService);

    await service.update('pack-1', 'user-1', {
      description: null,
      goal: null,
    });

    expect(prisma.studyPack.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'pack-1',
        ownerId: 'user-1',
      },
      data: {
        description: null,
        goal: null,
      },
    });
  });

  it('returns not found instead of updating another users Study Pack', async () => {
    const prisma = {
      studyPack: {
        updateMany: jest.fn().mockResolvedValue({
          count: 0,
        }),
        findFirst: jest.fn(),
      },
    };

    const service = new StudyPacksService(prisma as unknown as PrismaService);

    await expect(
      service.update('foreign-pack', 'user-1', {
        name: 'Unauthorized rename',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.studyPack.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'foreign-pack',
        ownerId: 'user-1',
      },
      data: {
        name: 'Unauthorized rename',
      },
    });

    expect(prisma.studyPack.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an empty metadata update', async () => {
    const prisma = {
      studyPack: {
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const service = new StudyPacksService(prisma as unknown as PrismaService);

    await expect(service.update('pack-1', 'user-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.studyPack.updateMany).not.toHaveBeenCalled();
    expect(prisma.studyPack.findFirst).not.toHaveBeenCalled();
  });
});
