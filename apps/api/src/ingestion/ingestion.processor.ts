import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';

import {
  DOCUMENT_INGESTION_QUEUE,
  PROCESS_DOCUMENT_JOB,
} from './ingestion.constants';

import {
  ParsedDocumentResponse,
  ProcessDocumentJobData,
} from './ingestion.types';

@Injectable()
@Processor(DOCUMENT_INGESTION_QUEUE)
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<ProcessDocumentJobData>): Promise<void> {
    if (job.name !== PROCESS_DOCUMENT_JOB) {
      throw new Error(`Unsupported ingestion job: ${job.name}`);
    }

    const document = await this.prisma.document.findUnique({
      where: {
        id: job.data.documentId,
      },
    });

    if (!document) {
      throw new Error(`Document ${job.data.documentId} was not found`);
    }

    if (!document.storageKey) {
      throw new Error(`Document ${document.id} has no storage key`);
    }

    this.logger.log(`Processing ${document.originalName} (${document.id})`);

    await this.prisma.document.update({
      where: {
        id: document.id,
      },
      data: {
        status: 'PROCESSING',
        errorMessage: null,
      },
    });

    try {
      const fileBuffer = await this.storage.readDocument(document.storageKey);

      const parsed = await this.parseWithAiService(
        fileBuffer,
        document.originalName,
        document.mimeType,
      );

      await this.prisma.document.update({
        where: {
          id: document.id,
        },

        data: {
          parser: parsed.parser,

          parsedMetadata: parsed.metadata,

          status: 'READY',

          errorMessage: null,

          units: {
            deleteMany: {},

            create: parsed.units.map((unit) => ({
              unitIndex: unit.index,
              kind: unit.kind,
              label: unit.label,
              text: unit.text,
              metadata: unit.metadata,
            })),
          },
        },
      });

      this.logger.log(
        `Finished ${document.originalName}: ${parsed.units.length} units`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown ingestion error';

      const totalAttempts = job.opts.attempts ?? 1;

      const currentAttempt = job.attemptsMade + 1;

      const isFinalAttempt = currentAttempt >= totalAttempts;

      if (isFinalAttempt) {
        await this.prisma.document.update({
          where: {
            id: document.id,
          },
          data: {
            status: 'FAILED',
            errorMessage: message,
          },
        });

        this.logger.error(
          `Ingestion permanently failed for ${document.originalName}: ${message}`,
        );
      } else {
        this.logger.warn(
          `Ingestion attempt ${currentAttempt}/${totalAttempts} failed for ${document.originalName}: ${message}`,
        );
      }

      throw error;
    }
  }

  private async parseWithAiService(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<ParsedDocumentResponse> {
    const aiServiceUrl = this.configService
      .getOrThrow<string>('AI_SERVICE_URL')
      .replace(/\/$/, '');

    const formData = new FormData();

    // Copy Buffer bytes into a real ArrayBuffer.
    // This avoids Buffer<ArrayBufferLike> vs BlobPart
    // incompatibilities in newer Node/TypeScript typings.
    const arrayBuffer = new ArrayBuffer(fileBuffer.byteLength);

    const byteView = new Uint8Array(arrayBuffer);

    byteView.set(fileBuffer);

    const blob = new Blob([arrayBuffer], {
      type: mimeType,
    });

    formData.append('file', blob, filename);

    const response = await fetch(`${aiServiceUrl}/ingestion/parse`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const responseBody = await response.text();

      throw new Error(
        `AI service returned ${response.status}: ${responseBody}`,
      );
    }

    return (await response.json()) as ParsedDocumentResponse;
  }
}
