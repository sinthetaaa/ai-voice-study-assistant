/* eslint-disable @typescript-eslint/no-require-imports */

import { ConflictException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';

import type { StudyPacksService as StudyPacksServiceType } from './study-packs.service';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { StudyPacksService } =
  require('./study-packs.service') as typeof import('./study-packs.service');

type TransactionMock = {
  studyPack: {
    count: jest.Mock;
    updateMany: jest.Mock;
  };

  user: {
    count: jest.Mock;
  };
};

describe('StudyPacksService legacy ownership claim', () => {
  let transaction: TransactionMock;

  let prisma: {
    $transaction: jest.Mock;
  };

  let service: StudyPacksServiceType;

  beforeEach(() => {
    transaction = {
      studyPack: {
        count: jest.fn(),
        updateMany: jest.fn(),
      },

      user: {
        count: jest.fn(),
      },
    };

    prisma = {
      $transaction: jest.fn(
        async (callback: (tx: TransactionMock) => Promise<unknown>) =>
          callback(transaction),
      ),
    };

    service = new StudyPacksService(prisma as unknown as PrismaService);
  });

  it('claims every unowned pack for the sole user', async () => {
    transaction.studyPack.count.mockResolvedValue(16);

    transaction.user.count.mockResolvedValue(1);

    transaction.studyPack.updateMany.mockResolvedValue({
      count: 16,
    });

    await expect(service.claimLegacyPacks('user-1')).resolves.toEqual({
      claimedCount: 16,
    });

    expect(transaction.studyPack.updateMany).toHaveBeenCalledWith({
      where: {
        ownerId: null,
      },
      data: {
        ownerId: 'user-1',
      },
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('is idempotent when no unowned packs remain', async () => {
    transaction.studyPack.count.mockResolvedValue(0);

    await expect(service.claimLegacyPacks('user-1')).resolves.toEqual({
      claimedCount: 0,
    });

    expect(transaction.user.count).not.toHaveBeenCalled();

    expect(transaction.studyPack.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to claim legacy packs when multiple users exist', async () => {
    transaction.studyPack.count.mockResolvedValue(16);

    transaction.user.count.mockResolvedValue(2);

    await expect(service.claimLegacyPacks('user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(transaction.studyPack.updateMany).not.toHaveBeenCalled();
  });

  it('never targets already-owned packs', async () => {
    transaction.studyPack.count.mockResolvedValue(3);

    transaction.user.count.mockResolvedValue(1);

    transaction.studyPack.updateMany.mockResolvedValue({
      count: 3,
    });

    await service.claimLegacyPacks('user-1');

    expect(transaction.studyPack.updateMany).toHaveBeenCalledWith({
      where: {
        ownerId: null,
      },
      data: {
        ownerId: 'user-1',
      },
    });
  });

  it('rolls back when the observed claim count changes', async () => {
    transaction.studyPack.count.mockResolvedValue(16);

    transaction.user.count.mockResolvedValue(1);

    transaction.studyPack.updateMany.mockResolvedValue({
      count: 15,
    });

    await expect(service.claimLegacyPacks('user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('maps a serializable transaction conflict to 409', async () => {
    prisma.$transaction.mockRejectedValueOnce({
      code: 'P2034',
    });

    await expect(service.claimLegacyPacks('user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
