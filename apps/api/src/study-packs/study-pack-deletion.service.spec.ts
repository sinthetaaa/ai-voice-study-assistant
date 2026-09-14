/* eslint-disable @typescript-eslint/no-require-imports */

import { NotFoundException } from '@nestjs/common';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import type { PrismaService } from '../prisma/prisma.service';
import type { LocalStorageService } from '../storage/local-storage.service';
const { StudyPackDeletionService } =
  require('./study-pack-deletion.service') as typeof import('./study-pack-deletion.service');

type MockFn = jest.Mock;

function createHarness(options?: {
  owned?: boolean;
  finalDeleteCount?: number;
}) {
  const transaction = {
    studyPack: {
      findFirst: jest.fn().mockResolvedValue(
        options?.owned === false
          ? null
          : {
              id: 'pack-1',
            },
      ),
      deleteMany: jest.fn().mockResolvedValue({
        count: options?.finalDeleteCount ?? 1,
      }),
    },
    masteryEvent: {
      deleteMany: jest.fn().mockResolvedValue({
        count: 3,
      }),
    },
    questionAttempt: {
      deleteMany: jest.fn().mockResolvedValue({
        count: 5,
      }),
    },
    studySession: {
      deleteMany: jest.fn().mockResolvedValue({
        count: 2,
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(
      async (
        callback: (transactionClient: typeof transaction) => Promise<void>,
      ) => callback(transaction),
    ),
  };

  const storage = {
    deleteStudyPackDocuments: jest.fn().mockResolvedValue(undefined),
  };

  const service = new StudyPackDeletionService(
    prisma as unknown as PrismaService,
    storage as unknown as LocalStorageService,
  );

  return {
    service,
    transaction,
    storage,
  };
}

describe('StudyPackDeletionService', () => {
  it('deletes restrictive history before deleting the owned Study Pack', async () => {
    const { service, transaction, storage } = createHarness();

    await service.remove('pack-1', 'user-1');

    expect(transaction.studyPack.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'pack-1',
        ownerId: 'user-1',
      },
      select: {
        id: true,
      },
    });

    expect(transaction.masteryEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        concept: {
          studyPackId: 'pack-1',
        },
      },
    });

    expect(transaction.questionAttempt.deleteMany).toHaveBeenCalledWith({
      where: {
        question: {
          concept: {
            studyPackId: 'pack-1',
          },
        },
      },
    });

    expect(transaction.studySession.deleteMany).toHaveBeenCalledWith({
      where: {
        studyPackId: 'pack-1',
      },
    });

    expect(transaction.studyPack.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'pack-1',
        ownerId: 'user-1',
      },
    });

    expect(storage.deleteStudyPackDocuments).toHaveBeenCalledWith('pack-1');

    const masteryOrder = (transaction.masteryEvent.deleteMany as MockFn).mock
      .invocationCallOrder[0];

    const attemptOrder = (transaction.questionAttempt.deleteMany as MockFn).mock
      .invocationCallOrder[0];

    const sessionOrder = (transaction.studySession.deleteMany as MockFn).mock
      .invocationCallOrder[0];

    const packOrder = (transaction.studyPack.deleteMany as MockFn).mock
      .invocationCallOrder[0];

    expect(masteryOrder).toBeLessThan(attemptOrder);
    expect(attemptOrder).toBeLessThan(sessionOrder);
    expect(sessionOrder).toBeLessThan(packOrder);
  });

  it('returns 404 without touching history or storage for a foreign Study Pack', async () => {
    const { service, transaction, storage } = createHarness({
      owned: false,
    });

    await expect(
      service.remove('foreign-pack', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(transaction.masteryEvent.deleteMany).not.toHaveBeenCalled();
    expect(transaction.questionAttempt.deleteMany).not.toHaveBeenCalled();
    expect(transaction.studySession.deleteMany).not.toHaveBeenCalled();
    expect(transaction.studyPack.deleteMany).not.toHaveBeenCalled();
    expect(storage.deleteStudyPackDocuments).not.toHaveBeenCalled();
  });

  it('does not clean storage when the final database delete loses a race', async () => {
    const { service, storage } = createHarness({
      finalDeleteCount: 0,
    });

    await expect(service.remove('pack-1', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(storage.deleteStudyPackDocuments).not.toHaveBeenCalled();
  });

  it('keeps committed deletion successful if local cleanup fails', async () => {
    const { service, storage } = createHarness();

    storage.deleteStudyPackDocuments.mockRejectedValue(
      new Error('filesystem unavailable'),
    );

    await expect(service.remove('pack-1', 'user-1')).resolves.toBeUndefined();
  });
});
