import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  basename,
  extname,
  join,
} from 'node:path';
import { promisify } from 'node:util';

import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { IngestionQueueService } from '../ingestion/ingestion-queue.service';
import { partitionDocumentUploads } from './document-upload-policy';

const execFileAsync = promisify(execFile);

const CONVERTIBLE_PREVIEW_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.rtf',
  '.odt',
  '.odp',
  '.ods',
  '.xls',
  '.xlsx',
  '.md',
]);

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
    private readonly ingestionQueue: IngestionQueueService,
  ) {}

  async listDocuments(studyPackId: string) {
    return this.prisma.document.findMany({
      where: {
        studyPackId,
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
  }

  private async findDocument(
    studyPackId: string,
    documentId: string,
  ) {
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
      throw new NotFoundException(
        `Document ${documentId} has no stored file`,
      );
    }

    return document;
  }

  async getDocumentFile(
    studyPackId: string,
    documentId: string,
  ): Promise<{
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  }> {
    const document = await this.findDocument(
      studyPackId,
      documentId,
    );

    const buffer = await this.storage.readDocument(
      document.storageKey!,
    );

    return {
      buffer,
      originalName: document.originalName,
      mimeType:
        document.mimeType || 'application/octet-stream',
    };
  }

  async getDocumentPreview(
    studyPackId: string,
    documentId: string,
  ): Promise<{
    buffer: Buffer;
    originalName: string;
    mimeType: 'application/pdf';
  }> {
    const document = await this.findDocument(
      studyPackId,
      documentId,
    );

    const storageKey = document.storageKey!;
    const extension = extname(
      document.originalName,
    ).toLowerCase();

    /*
     * PDFs already are their own preview.
     */
    if (
      extension === '.pdf' ||
      document.mimeType === 'application/pdf'
    ) {
      return {
        buffer: await this.storage.readDocument(storageKey),
        originalName: document.originalName,
        mimeType: 'application/pdf',
      };
    }

    if (!CONVERTIBLE_PREVIEW_EXTENSIONS.has(extension)) {
      throw new BadRequestException(
        `Inline preview is not available for ${extension || 'this file type'}`,
      );
    }

    /*
     * Cache generated previews alongside the original.
     * No database column is required.
     */
    const previewStorageKey =
      this.storage.previewStorageKey(storageKey);

    if (await this.storage.exists(previewStorageKey)) {
      return {
        buffer:
          await this.storage.readDocument(
            previewStorageKey,
          ),
        originalName: `${basename(
          document.originalName,
          extension,
        )}.pdf`,
        mimeType: 'application/pdf',
      };
    }

    const originalBuffer =
      await this.storage.readDocument(storageKey);

    const previewBuffer =
      await this.convertToPdf(
        originalBuffer,
        extension,
      );

    await this.storage.saveDerivedDocument(
      previewStorageKey,
      previewBuffer,
    );

    return {
      buffer: previewBuffer,
      originalName: `${basename(
        document.originalName,
        extension,
      )}.pdf`,
      mimeType: 'application/pdf',
    };
  }

  private async convertToPdf(
    buffer: Buffer,
    extension: string,
  ): Promise<Buffer> {
    const workDir = await mkdtemp(
      join(tmpdir(), 'studyloop-preview-'),
    );

    const inputPath = join(
      workDir,
      `source${extension}`,
    );

    const outputPath = join(
      workDir,
      'source.pdf',
    );

    try {
      await writeFile(inputPath, buffer);

      const binary =
        process.env.LIBREOFFICE_BIN ||
        (process.platform === 'darwin'
          ? '/Applications/LibreOffice.app/Contents/MacOS/soffice'
          : 'soffice');

      try {
        await execFileAsync(
          binary,
          [
            '--headless',
            '--convert-to',
            'pdf',
            '--outdir',
            workDir,
            inputPath,
          ],
          {
            timeout: 120_000,
            maxBuffer: 10 * 1024 * 1024,
          },
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        throw new ServiceUnavailableException(
          `StudyLoop could not create an inline document preview: ${message}`,
        );
      }

      try {
        return await readFile(outputPath);
      } catch {
        throw new ServiceUnavailableException(
          'LibreOffice finished without producing a PDF preview.',
        );
      }
    } finally {
      await rm(workDir, {
        recursive: true,
        force: true,
      });
    }
  }

  async uploadDocuments(
    studyPackId: string,
    files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException(
        'At least one document must be uploaded',
      );
    }

    const studyPack =
      await this.prisma.studyPack.findUnique({
        where: {
          id: studyPackId,
        },
        select: {
          id: true,
        },
      });

    if (!studyPack) {
      throw new NotFoundException(
        `Study pack ${studyPackId} was not found`,
      );
    }

    const {
      acceptedFiles,
      rejected,
    } = partitionDocumentUploads(files);

    if (acceptedFiles.length === 0) {
      return {
        studyPackId,
        uploaded: 0,
        documents: [],
        rejected,
      };
    }

    const storedFiles: {
      file: Express.Multer.File;
      storageKey: string;
    }[] = [];

    let createdDocumentIds: string[] = [];

    try {
      for (const file of acceptedFiles) {
        const stored =
          await this.storage.saveDocument(
            studyPackId,
            file,
          );

        storedFiles.push({
          file,
          storageKey: stored.storageKey,
        });
      }

      const documents =
        await this.prisma.$transaction(
          storedFiles.map(
            ({ file, storageKey }) =>
              this.prisma.document.create({
                data: {
                  studyPackId,
                  originalName:
                    file.originalname,
                  mimeType: file.mimetype,
                  sizeBytes: file.size,
                  storageKey,
                },
              }),
          ),
        );

      createdDocumentIds =
        documents.map(
          (document) => document.id,
        );

      await this.ingestionQueue.enqueueDocuments(
        createdDocumentIds,
      );

      return {
        studyPackId,
        uploaded: documents.length,
        documents,
        rejected,
      };
    } catch (error) {
      if (createdDocumentIds.length > 0) {
        await this.prisma.document.deleteMany({
          where: {
            id: {
              in: createdDocumentIds,
            },
          },
        });
      }

      await Promise.allSettled(
        storedFiles.map(({ storageKey }) =>
          this.storage.delete(storageKey),
        ),
      );

      throw error;
    }
  }
}
