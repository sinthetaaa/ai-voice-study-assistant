/* eslint-disable @typescript-eslint/no-require-imports */

import { BadRequestException } from '@nestjs/common';
import { PassThrough } from 'node:stream';
import type { PrismaService } from '../prisma/prisma.service';
import type { LocalStorageService } from '../storage/local-storage.service';
import type { IngestionQueueService } from '../ingestion/ingestion-queue.service';
import { MAX_DOCUMENT_FILE_BYTES } from './document-upload-policy';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { DocumentsService } =
  require('./documents.service') as typeof import('./documents.service');

function uploadFile(
  originalname: string,
  mimetype: string,
  size: number,
): Express.Multer.File {
  return {
    fieldname: 'files',
    originalname,
    encoding: '7bit',
    mimetype,
    size,
    buffer:
      size <= MAX_DOCUMENT_FILE_BYTES
        ? Buffer.from('content')
        : Buffer.alloc(0),
    stream: new PassThrough(),
    destination: '',
    filename: '',
    path: '',
  };
}

function createHarness() {
  let documentNumber = 0;

  const prisma = {
    studyPack: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'pack-1',
      }),
    },

    document: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: `doc-${++documentNumber}`,
          ...data,
        }),
      ),

      deleteMany: jest.fn().mockResolvedValue({
        count: 1,
      }),
    },

    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };

  const storage = {
    saveDocument: jest.fn((studyPackId: string, file: Express.Multer.File) => ({
      storageKey: `documents/${studyPackId}/${file.originalname}`,
    })),

    delete: jest.fn().mockResolvedValue(undefined),
  };

  const ingestionQueue = {
    enqueueDocuments: jest.fn().mockResolvedValue(undefined),
  };

  const service = new DocumentsService(
    prisma as unknown as PrismaService,
    storage as unknown as LocalStorageService,
    ingestionQueue as unknown as IngestionQueueService,
  );

  return {
    service,
    prisma,
    storage,
    ingestionQueue,
  };
}

describe('DocumentsService upload validation', () => {
  it('persists valid files and reports rejected siblings', async () => {
    const { service, prisma, storage, ingestionQueue } = createHarness();

    const validPdf = uploadFile('notes.pdf', 'application/pdf', 1024);

    const unsupported = uploadFile(
      'program.exe',
      'application/octet-stream',
      2048,
    );

    const oversized = uploadFile(
      'huge.pdf',
      'application/pdf',
      MAX_DOCUMENT_FILE_BYTES + 1,
    );

    const validText = uploadFile('notes.txt', 'text/plain', 512);

    const result = await service.uploadDocuments('pack-1', [
      validPdf,
      unsupported,
      oversized,
      validText,
    ]);

    expect(result.uploaded).toBe(2);

    expect(result.rejected).toEqual([
      {
        originalName: 'program.exe',
        mimeType: 'application/octet-stream',
        sizeBytes: 2048,
        reason: 'UNSUPPORTED_TYPE',
      },
      {
        originalName: 'huge.pdf',
        mimeType: 'application/pdf',
        sizeBytes: MAX_DOCUMENT_FILE_BYTES + 1,
        reason: 'FILE_TOO_LARGE',
      },
    ]);

    expect(storage.saveDocument).toHaveBeenCalledTimes(2);

    expect(storage.saveDocument).toHaveBeenNthCalledWith(1, 'pack-1', validPdf);

    expect(storage.saveDocument).toHaveBeenNthCalledWith(
      2,
      'pack-1',
      validText,
    );

    expect(prisma.document.create).toHaveBeenCalledTimes(2);

    expect(ingestionQueue.enqueueDocuments).toHaveBeenCalledWith([
      'doc-1',
      'doc-2',
    ]);
  });

  it('returns structured rejections when all files are rejected', async () => {
    const { service, prisma, storage, ingestionQueue } = createHarness();

    const result = await service.uploadDocuments('pack-1', [
      uploadFile('program.exe', 'application/octet-stream', 100),
      uploadFile('huge.pdf', 'application/pdf', MAX_DOCUMENT_FILE_BYTES + 1),
    ]);

    expect(result.uploaded).toBe(0);
    expect(result.documents).toEqual([]);
    expect(result.rejected).toHaveLength(2);

    expect(storage.saveDocument).not.toHaveBeenCalled();

    expect(prisma.$transaction).not.toHaveBeenCalled();

    expect(ingestionQueue.enqueueDocuments).not.toHaveBeenCalled();
  });

  it('still rolls back accepted files when queueing fails', async () => {
    const { service, prisma, storage, ingestionQueue } = createHarness();

    ingestionQueue.enqueueDocuments.mockRejectedValueOnce(
      new Error('queue unavailable'),
    );

    await expect(
      service.uploadDocuments('pack-1', [
        uploadFile('notes.pdf', 'application/pdf', 1024),
        uploadFile('program.exe', 'application/octet-stream', 100),
      ]),
    ).rejects.toThrow('queue unavailable');

    expect(prisma.document.deleteMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['doc-1'],
        },
      },
    });

    expect(storage.delete).toHaveBeenCalledWith('documents/pack-1/notes.pdf');
  });

  it('still rejects an empty multipart request', async () => {
    const { service } = createHarness();

    await expect(service.uploadDocuments('pack-1', [])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
