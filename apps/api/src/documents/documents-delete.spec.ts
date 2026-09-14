/* eslint-disable @typescript-eslint/no-require-imports */

import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';
import type { LocalStorageService } from '../storage/local-storage.service';
import type { IngestionQueueService } from '../ingestion/ingestion-queue.service';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { DocumentsService } =
  require('./documents.service') as typeof import('./documents.service');

function createHarness() {
  const transaction = {
    studyPack: {
      updateMany: jest.fn().mockResolvedValue({
        count: 1,
      }),

      update: jest.fn().mockResolvedValue({
        hierarchyRevision: 8,
      }),
    },

    document: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'doc-1',
        storageKey: 'documents/pack-1/doc-1.txt',
      }),

      delete: jest.fn().mockResolvedValue({
        id: 'doc-1',
      }),
    },

    conceptSource: {
      count: jest.fn().mockResolvedValue(1),
    },

    questionSource: {
      count: jest.fn().mockResolvedValue(1),
    },

    studySession: {
      updateMany: jest.fn().mockResolvedValue({
        count: 1,
      }),
    },

    concept: {
      deleteMany: jest.fn().mockResolvedValue({
        count: 1,
      }),

      count: jest.fn().mockResolvedValue(2),

      updateMany: jest.fn().mockResolvedValue({
        count: 0,
      }),
    },

    coreConcept: {
      deleteMany: jest.fn().mockResolvedValue({
        count: 1,
      }),
    },

    studyTopic: {
      deleteMany: jest.fn().mockResolvedValue({
        count: 1,
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };

  const storage = {
    delete: jest.fn().mockResolvedValue(undefined),
  };

  const ingestionQueue = {
    enqueueStudyPackHierarchy: jest.fn().mockResolvedValue(undefined),
  };

  const service = new DocumentsService(
    prisma as unknown as PrismaService,
    storage as unknown as LocalStorageService,
    ingestionQueue as unknown as IngestionQueueService,
  );

  return {
    service,
    prisma,
    transaction,
    storage,
    ingestionQueue,
  };
}

describe('DocumentsService document deletion', () => {
  it('deletes source-bearing material, abandons active sessions, and queues hierarchy regeneration', async () => {
    const { service, transaction, storage, ingestionQueue } = createHarness();

    await service.removeDocument('pack-1', 'doc-1');

    expect(transaction.studyPack.update).toHaveBeenCalledTimes(1);

    expect(transaction.studyPack.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'pack-1',
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          hierarchyStatus: 'DIRTY',
          hierarchyRevision: {
            increment: 1,
          },
        }),
      }),
    );

    expect(transaction.studySession.updateMany).toHaveBeenCalledWith({
      where: {
        studyPackId: 'pack-1',
        status: 'ACTIVE',
      },
      data: {
        status: 'ABANDONED',
        currentConceptId: null,
        currentQuestionId: null,
      },
    });

    expect(transaction.document.delete).toHaveBeenCalledWith({
      where: {
        id: 'doc-1',
      },
    });

    expect(transaction.concept.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          studyPackId: 'pack-1',
          sources: {
            none: {},
          },
        }),
      }),
    );

    expect(ingestionQueue.enqueueStudyPackHierarchy).toHaveBeenCalledWith(
      'pack-1',
    );

    expect(storage.delete).toHaveBeenCalledWith('documents/pack-1/doc-1.txt');

    expect(transaction.coreConcept.deleteMany).not.toHaveBeenCalled();

    expect(transaction.studyTopic.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes source-free material without invalidating hierarchy or active sessions', async () => {
    const { service, transaction, ingestionQueue } = createHarness();

    transaction.conceptSource.count.mockResolvedValueOnce(0);

    transaction.questionSource.count.mockResolvedValueOnce(0);

    await service.removeDocument('pack-1', 'doc-1');

    expect(transaction.studyPack.update).not.toHaveBeenCalled();

    expect(transaction.studySession.updateMany).not.toHaveBeenCalled();

    expect(transaction.concept.deleteMany).not.toHaveBeenCalled();

    expect(ingestionQueue.enqueueStudyPackHierarchy).not.toHaveBeenCalled();

    expect(transaction.document.delete).toHaveBeenCalledTimes(1);
  });

  it('abandons active sessions for question-only provenance without invalidating hierarchy', async () => {
    const { service, transaction, ingestionQueue } = createHarness();

    transaction.conceptSource.count.mockResolvedValueOnce(0);

    transaction.questionSource.count.mockResolvedValueOnce(1);

    await service.removeDocument('pack-1', 'doc-1');

    expect(transaction.studyPack.update).not.toHaveBeenCalled();

    expect(transaction.studySession.updateMany).toHaveBeenCalledWith({
      where: {
        studyPackId: 'pack-1',
        status: 'ACTIVE',
      },
      data: {
        status: 'ABANDONED',
        currentConceptId: null,
        currentQuestionId: null,
      },
    });

    expect(ingestionQueue.enqueueStudyPackHierarchy).not.toHaveBeenCalled();
  });

  it('settles an empty authoritative hierarchy when the last active concepts disappear', async () => {
    const { service, transaction, ingestionQueue } = createHarness();

    transaction.concept.count.mockResolvedValueOnce(0);

    transaction.studyPack.update
      .mockResolvedValueOnce({
        hierarchyRevision: 8,
      })
      .mockResolvedValueOnce({});

    await service.removeDocument('pack-1', 'doc-1');

    expect(transaction.concept.count).toHaveBeenCalledWith({
      where: {
        studyPackId: 'pack-1',
        sources: {
          some: {
            chunk: {
              unit: {
                document: {
                  status: 'READY',
                },
              },
            },
          },
        },
      },
    });

    expect(transaction.concept.updateMany).toHaveBeenCalledWith({
      where: {
        studyPackId: 'pack-1',
      },
      data: {
        coreConceptId: null,
        positionInCore: null,
      },
    });

    expect(transaction.coreConcept.deleteMany).toHaveBeenCalledWith({
      where: {
        studyPackId: 'pack-1',
      },
    });

    expect(transaction.studyTopic.deleteMany).toHaveBeenCalledWith({
      where: {
        studyPackId: 'pack-1',
      },
    });

    expect(transaction.studyPack.update).toHaveBeenLastCalledWith({
      where: {
        id: 'pack-1',
      },
      data: {
        hierarchyStatus: 'READY',
        hierarchyGeneratedRevision: 8,
        hierarchyErrorMessage: null,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        hierarchyUpdatedAt: expect.any(Date),
      },
    });

    expect(ingestionQueue.enqueueStudyPackHierarchy).not.toHaveBeenCalled();
  });

  it('rejects a document outside the requested Study Pack', async () => {
    const { service, transaction, storage, ingestionQueue } = createHarness();

    transaction.document.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.removeDocument('pack-1', 'foreign-doc'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(storage.delete).not.toHaveBeenCalled();

    expect(ingestionQueue.enqueueStudyPackHierarchy).not.toHaveBeenCalled();
  });

  it('keeps committed deletion successful when physical cleanup fails', async () => {
    const { service, transaction, storage } = createHarness();

    storage.delete.mockRejectedValueOnce(new Error('filesystem unavailable'));

    await expect(
      service.removeDocument('pack-1', 'doc-1'),
    ).resolves.toBeUndefined();

    expect(transaction.document.delete).toHaveBeenCalledTimes(1);
  });

  it('keeps committed deletion successful when hierarchy queueing fails', async () => {
    const { service, transaction, ingestionQueue } = createHarness();

    ingestionQueue.enqueueStudyPackHierarchy.mockRejectedValueOnce(
      new Error('Redis unavailable'),
    );

    await expect(
      service.removeDocument('pack-1', 'doc-1'),
    ).resolves.toBeUndefined();

    expect(transaction.document.delete).toHaveBeenCalledTimes(1);
  });
});
