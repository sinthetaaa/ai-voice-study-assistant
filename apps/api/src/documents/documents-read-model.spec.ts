/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import type { PrismaService } from '../prisma/prisma.service';
import type { LocalStorageService } from '../storage/local-storage.service';
import type { IngestionQueueService } from '../ingestion/ingestion-queue.service';

const { DocumentsService } =
  require('./documents.service') as typeof import('./documents.service');

function createHarness() {
  const documents = [
    {
      id: 'document-1',
      studyPackId: 'pack-1',
      originalName: 'chapter-one.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      status: 'READY',
      errorMessage: null,
      conceptStatus: 'READY',
      conceptErrorMessage: null,
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
      updatedAt: new Date('2026-09-01T10:05:00.000Z'),
    },
    {
      id: 'document-2',
      studyPackId: 'pack-1',
      originalName: 'chapter-two.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      status: 'READY',
      errorMessage: null,
      conceptStatus: 'FAILED',
      conceptErrorMessage: 'concept extraction failed',
      createdAt: new Date('2026-09-02T10:00:00.000Z'),
      updatedAt: new Date('2026-09-02T10:10:00.000Z'),
    },
  ];

  const prisma = {
    document: {
      findMany: jest.fn().mockResolvedValue(documents),
    },
  };

  const storage = {};
  const ingestionQueue = {};

  const service = new DocumentsService(
    prisma as unknown as PrismaService,
    storage as unknown as LocalStorageService,
    ingestionQueue as unknown as IngestionQueueService,
  );

  return {
    service,
    prisma,
    documents,
  };
}

describe('DocumentsService read model', () => {
  it('returns the Study Pack document management fields in upload order', async () => {
    const { service, prisma, documents } = createHarness();

    await expect(service.listDocuments('pack-1')).resolves.toEqual(documents);

    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: {
        studyPackId: 'pack-1',
      },
      select: {
        id: true,
        studyPackId: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        errorMessage: true,
        conceptStatus: true,
        conceptErrorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  });

  it('preserves material and concept lifecycle states independently', async () => {
    const { service, prisma } = createHarness();

    prisma.document.findMany.mockResolvedValueOnce([
      {
        id: 'document-1',
        studyPackId: 'pack-1',
        originalName: 'material.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        status: 'READY',
        errorMessage: null,
        conceptStatus: 'FAILED',
        conceptErrorMessage: 'concept extraction failed',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const [document] = await service.listDocuments('pack-1');

    expect(document.status).toBe('READY');
    expect(document.errorMessage).toBeNull();
    expect(document.conceptStatus).toBe('FAILED');
    expect(document.conceptErrorMessage).toBe('concept extraction failed');
  });
});
