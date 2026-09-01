import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { IngestionQueueService } from '../ingestion/ingestion-queue.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
    private readonly ingestionQueue: IngestionQueueService,
  ) {}

  async getDocumentFile(
    studyPackId: string,
    documentId: string,
  ): Promise<{
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  }> {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,

        studyPackId,
      },

      select: {
        id: true,

        originalName: true,

        mimeType: true,

        storageKey: true,

        status: true,
      },
    });

    if (!document) {
      throw new NotFoundException(
        `Document ${documentId} was not found in Study Pack ${studyPackId}`,
      );
    }

    if (!document.storageKey) {
      throw new NotFoundException(`Document ${documentId} has no stored file`);
    }

    const buffer = await this.storage.readDocument(document.storageKey);

    return {
      buffer,

      originalName: document.originalName,

      mimeType: document.mimeType || 'application/octet-stream',
    };
  }

  async uploadDocuments(studyPackId: string, files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException(
        'At least one supported document must be uploaded',
      );
    }

    const studyPack = await this.prisma.studyPack.findUnique({
      where: {
        id: studyPackId,
      },
      select: {
        id: true,
      },
    });

    if (!studyPack) {
      throw new NotFoundException(`Study pack ${studyPackId} was not found`);
    }

    const storedFiles: {
      file: Express.Multer.File;
      storageKey: string;
    }[] = [];

    let createdDocumentIds: string[] = [];

    try {
      // Save uploaded files to local storage first
      for (const file of files) {
        const stored = await this.storage.saveDocument(studyPackId, file);

        storedFiles.push({
          file,
          storageKey: stored.storageKey,
        });
      }

      // Create all Document records atomically
      const documents = await this.prisma.$transaction(
        storedFiles.map(({ file, storageKey }) =>
          this.prisma.document.create({
            data: {
              studyPackId,
              originalName: file.originalname,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              storageKey,
            },
          }),
        ),
      );

      createdDocumentIds = documents.map((document) => document.id);

      // Queue every uploaded document for
      // asynchronous ingestion.
      await this.ingestionQueue.enqueueDocuments(createdDocumentIds);

      return {
        studyPackId,
        uploaded: documents.length,
        documents,
      };
    } catch (error) {
      // If DB records were created but queueing failed,
      // remove those records again.
      if (createdDocumentIds.length > 0) {
        await this.prisma.document.deleteMany({
          where: {
            id: {
              in: createdDocumentIds,
            },
          },
        });
      }

      // Remove any physical files that were stored
      // before the failure.
      await Promise.allSettled(
        storedFiles.map(({ storageKey }) => this.storage.delete(storageKey)),
      );

      throw error;
    }
  }
}
