jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import {
  GENERATE_STUDY_PACK_HIERARCHY_JOB,
  PROCESS_DOCUMENT_JOB,
} from './ingestion.constants';

import { IngestionProcessor } from './ingestion.processor';

const document = {
  id: 'doc-1',
  studyPackId: 'pack-1',
  originalName: 'reinforcement-learning.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  storageKey: 'documents/doc-1.pdf',
  status: 'UPLOADED',
  errorMessage: null,
  conceptStatus: 'PENDING',
  conceptErrorMessage: null,
  parser: null,
  parsedMetadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const parsedDocument = {
  filename: 'reinforcement-learning.pdf',
  extension: '.pdf',
  mime_type: 'application/pdf',
  parser: 'test-parser',
  units: [
    {
      index: 0,
      kind: 'page',
      label: 'Page 1',
      text: 'Q-learning learns state-action values.',
      metadata: {},
    },
  ],
  full_text: 'Q-learning learns state-action values.',
  metadata: {},
};

const chunk = {
  chunkIndex: 0,
  text: 'Q-learning learns state-action values.',
  charCount: 38,
  wordCount: 5,
  metadata: {},
};

const persistedChunk = {
  id: 'chunk-1',
  text: chunk.text,
  chunkIndex: 0,
  unit: {
    unitIndex: 0,
  },
};

function processDocumentJob(attemptsMade = 0) {
  return {
    name: PROCESS_DOCUMENT_JOB,
    data: {
      documentId: document.id,
    },
    attemptsMade,
    opts: {
      attempts: 3,
    },
  };
}

function hierarchyJob() {
  return {
    name: GENERATE_STUDY_PACK_HIERARCHY_JOB,
    data: {
      studyPackId: document.studyPackId,
    },
    attemptsMade: 0,
    opts: {
      attempts: 3,
    },
  };
}

function createHarness() {
  const prisma = {
    document: {
      findUnique: jest.fn().mockResolvedValue({
        ...document,
      }),

      update: jest.fn().mockResolvedValue({}),
    },

    documentChunk: {
      findMany: jest.fn().mockResolvedValue([persistedChunk]),
    },

    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  const storage = {
    readDocument: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  };

  const configService = {};

  const chunkingService = {
    chunkText: jest.fn().mockReturnValue([chunk]),
  };

  const embeddingClient = {
    embedDocuments: jest.fn().mockResolvedValue({
      embeddings: [
        Array.from({ length: 384 }, (_, index) => (index + 1) / 1000),
      ],
      provider: 'test-provider',
      model: 'test-model',
    }),
  };

  const conceptsService = {
    generateStudyPackConcepts: jest.fn().mockResolvedValue({
      conceptCount: 1,
      persistedConceptCount: 1,
      persistedSourceCount: 1,
    }),

    tryGenerateStudyPackHierarchy: jest.fn().mockResolvedValue(null),
  };

  const ingestionQueueService = {
    enqueueStudyPackHierarchy: jest.fn().mockResolvedValue({}),
  };

  const processor = new IngestionProcessor(
    prisma as never,
    storage as never,
    configService as never,
    chunkingService as never,
    embeddingClient as never,
    conceptsService as never,
    ingestionQueueService as never,
  );

  /*
   * Keep these tests entirely local.
   * Parsing itself belongs to the AI-service
   * integration, not this lifecycle suite.
   */
  (
    processor as unknown as {
      parseWithAiService: jest.Mock;
    }
  ).parseWithAiService = jest.fn().mockResolvedValue(parsedDocument);

  /*
   * Avoid noisy Nest logger output when intentionally
   * exercising permanent failure paths.
   */
  (
    processor as unknown as {
      logger: {
        log: jest.Mock;
        warn: jest.Mock;
        error: jest.Mock;
      };
    }
  ).logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  return {
    processor,
    prisma,
    storage,
    chunkingService,
    embeddingClient,
    conceptsService,
    ingestionQueueService,
  };
}

function updatePayloads(prisma: ReturnType<typeof createHarness>['prisma']) {
  return prisma.document.update.mock.calls.map(([argument]) => argument.data);
}

describe('Ingestion hierarchy orchestration', () => {
  it('runs hierarchy jobs without re-running document ingestion', async () => {
    const { processor, prisma, storage, conceptsService } = createHarness();

    await processor.process(hierarchyJob() as never);

    expect(conceptsService.tryGenerateStudyPackHierarchy).toHaveBeenCalledWith(
      'pack-1',
    );

    expect(conceptsService.generateStudyPackConcepts).not.toHaveBeenCalled();

    expect(prisma.document.findUnique).not.toHaveBeenCalled();

    expect(storage.readDocument).not.toHaveBeenCalled();
  });

  it('marks successful concept processing READY and schedules hierarchy generation', async () => {
    const { processor, prisma, ingestionQueueService } = createHarness();

    await processor.process(processDocumentJob() as never);

    const updates = updatePayloads(prisma);

    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'PROCESSING',
          conceptStatus: 'PENDING',
        }),

        expect.objectContaining({
          status: 'READY',
          errorMessage: null,
        }),

        expect.objectContaining({
          conceptStatus: 'PROCESSING',
          conceptErrorMessage: null,
        }),

        expect.objectContaining({
          conceptStatus: 'READY',
          conceptErrorMessage: null,
        }),
      ]),
    );

    expect(
      ingestionQueueService.enqueueStudyPackHierarchy,
    ).toHaveBeenCalledTimes(1);

    expect(
      ingestionQueueService.enqueueStudyPackHierarchy,
    ).toHaveBeenCalledWith('pack-1');
  });

  it('keeps material READY when concept processing permanently fails', async () => {
    const { processor, prisma, conceptsService, ingestionQueueService } =
      createHarness();

    conceptsService.generateStudyPackConcepts.mockRejectedValue(
      new Error('concept extraction failed'),
    );

    await expect(
      processor.process(processDocumentJob(2) as never),
    ).rejects.toThrow('concept extraction failed');

    const updates = updatePayloads(prisma);

    expect(updates).toContainEqual({
      status: 'READY',
      errorMessage: null,
      conceptStatus: 'FAILED',
      conceptErrorMessage: 'concept extraction failed',
    });

    expect(
      ingestionQueueService.enqueueStudyPackHierarchy,
    ).toHaveBeenCalledWith('pack-1');
  });

  it('settles both material and concept state when material ingestion permanently fails', async () => {
    const {
      processor,
      prisma,
      storage,
      conceptsService,
      ingestionQueueService,
    } = createHarness();

    storage.readDocument.mockRejectedValue(new Error('storage unavailable'));

    await expect(
      processor.process(processDocumentJob(2) as never),
    ).rejects.toThrow('storage unavailable');

    const updates = updatePayloads(prisma);

    expect(updates).toContainEqual({
      status: 'FAILED',
      errorMessage: 'storage unavailable',
      conceptStatus: 'FAILED',
      conceptErrorMessage: 'storage unavailable',
    });

    expect(conceptsService.generateStudyPackConcepts).not.toHaveBeenCalled();

    expect(
      ingestionQueueService.enqueueStudyPackHierarchy,
    ).toHaveBeenCalledWith('pack-1');
  });

  it('does not fail successful document processing when hierarchy enqueue fails', async () => {
    const { processor, prisma, ingestionQueueService } = createHarness();

    ingestionQueueService.enqueueStudyPackHierarchy.mockRejectedValue(
      new Error('Redis temporarily unavailable'),
    );

    await expect(
      processor.process(processDocumentJob() as never),
    ).resolves.toBeUndefined();

    const updates = updatePayloads(prisma);

    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'READY',
        }),

        expect.objectContaining({
          conceptStatus: 'READY',
        }),
      ]),
    );

    /*
     * No final FAILED state should be written just
     * because scheduling the hierarchy job failed.
     */
    expect(
      updates.some(
        (data) => data.status === 'FAILED' || data.conceptStatus === 'FAILED',
      ),
    ).toBe(false);
  });

  it('retries hierarchy failures without touching document ingestion', async () => {
    const { processor, prisma, storage, conceptsService } = createHarness();

    conceptsService.tryGenerateStudyPackHierarchy.mockRejectedValue(
      new Error('hierarchy AI unavailable'),
    );

    await expect(processor.process(hierarchyJob() as never)).rejects.toThrow(
      'hierarchy AI unavailable',
    );

    /*
     * A hierarchy retry must remain completely isolated
     * from the expensive document ingestion pipeline.
     */
    expect(prisma.document.findUnique).not.toHaveBeenCalled();

    expect(prisma.document.update).not.toHaveBeenCalled();

    expect(storage.readDocument).not.toHaveBeenCalled();

    expect(conceptsService.generateStudyPackConcepts).not.toHaveBeenCalled();
  });
});
