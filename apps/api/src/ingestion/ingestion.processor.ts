import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { ChunkingService } from '../chunking/chunking.service';
import { EmbeddingClientService } from '../embeddings/embedding-client.service';

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

    private readonly chunkingService: ChunkingService,

    private readonly embeddingClient: EmbeddingClientService,
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
      /*
       * ------------------------------------------------
       * 1. Read uploaded file
       * ------------------------------------------------
       */

      const fileBuffer = await this.storage.readDocument(document.storageKey);

      /*
       * ------------------------------------------------
       * 2. Parse document through FastAPI
       * ------------------------------------------------
       */

      const parsed = await this.parseWithAiService(
        fileBuffer,
        document.originalName,
        document.mimeType,
      );

      /*
       * ------------------------------------------------
       * 3. Generate deterministic chunks
       * ------------------------------------------------
       */

      const preparedUnits = parsed.units.map((unit) => {
        const chunks = this.chunkingService.chunkText(unit.text);

        return {
          unit,
          chunks,
        };
      });

      const chunkCount = preparedUnits.reduce(
        (total, preparedUnit) => total + preparedUnit.chunks.length,
        0,
      );

      if (chunkCount === 0) {
        throw new Error('Document produced no searchable chunks');
      }

      /*
       * ------------------------------------------------
       * 4. Persist normalized units + chunks
       *
       * IMPORTANT:
       * The document remains PROCESSING here.
       * It becomes READY only after embeddings
       * have been generated and stored.
       * ------------------------------------------------
       */

      await this.prisma.document.update({
        where: {
          id: document.id,
        },

        data: {
          parser: parsed.parser,

          parsedMetadata: parsed.metadata,

          errorMessage: null,

          units: {
            /*
             * Re-ingestion is deterministic.
             *
             * Existing DocumentChunk rows are
             * removed automatically because the
             * DocumentUnit -> DocumentChunk
             * relation uses ON DELETE CASCADE.
             */
            deleteMany: {},

            create: preparedUnits.map(({ unit, chunks }) => ({
              unitIndex: unit.index,

              kind: unit.kind,

              label: unit.label,

              text: unit.text,

              metadata: unit.metadata,

              chunks: {
                create: chunks.map((chunk) => ({
                  chunkIndex: chunk.chunkIndex,

                  text: chunk.text,

                  charCount: chunk.charCount,

                  wordCount: chunk.wordCount,

                  metadata: chunk.metadata,
                })),
              },
            })),
          },
        },
      });

      /*
       * ------------------------------------------------
       * 5. Load the persisted chunks
       *
       * We query them from PostgreSQL rather than
       * relying on the in-memory objects so the
       * IDs used for vector persistence are the
       * actual database IDs.
       * ------------------------------------------------
       */

      const persistedChunks = await this.prisma.documentChunk.findMany({
        where: {
          unit: {
            documentId: document.id,
          },
        },

        select: {
          id: true,
          text: true,
          chunkIndex: true,

          unit: {
            select: {
              unitIndex: true,
            },
          },
        },

        orderBy: [
          {
            unit: {
              unitIndex: 'asc',
            },
          },

          {
            chunkIndex: 'asc',
          },
        ],
      });

      if (persistedChunks.length !== chunkCount) {
        throw new Error(
          `Persisted chunk count mismatch: expected ${chunkCount}, received ${persistedChunks.length}`,
        );
      }

      /*
       * ------------------------------------------------
       * 6. Generate BGE document embeddings
       *
       * EmbeddingClientService automatically
       * batches requests in groups of at most 64.
       * ------------------------------------------------
       */

      const embeddingResult = await this.embeddingClient.embedDocuments(
        persistedChunks.map((chunk) => chunk.text),
      );

      if (embeddingResult.embeddings.length !== persistedChunks.length) {
        throw new Error(
          `Embedding count mismatch: expected ${persistedChunks.length}, received ${embeddingResult.embeddings.length}`,
        );
      }

      /*
       * ------------------------------------------------
       * 7. Store vectors in PostgreSQL
       *
       * Prisma represents vector(384) as an
       * Unsupported field, so vector persistence
       * is performed using parameterized raw SQL.
       * ------------------------------------------------
       */

      for (let index = 0; index < persistedChunks.length; index += 1) {
        const chunk = persistedChunks[index];

        const embedding = embeddingResult.embeddings[index];

        const vectorLiteral = this.toVectorLiteral(embedding);

        await this.prisma.$executeRaw`
          UPDATE "DocumentChunk"
          SET
            "embedding" = ${vectorLiteral}::vector,
            "embeddingProvider" = ${embeddingResult.provider},
            "embeddingModel" = ${embeddingResult.model},
            "embeddedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${chunk.id}
        `;
      }

      /*
       * ------------------------------------------------
       * 8. Mark document READY
       *
       * READY now means:
       *
       * parsed
       * + chunked
       * + embedded
       * ------------------------------------------------
       */

      await this.prisma.document.update({
        where: {
          id: document.id,
        },

        data: {
          status: 'READY',
          errorMessage: null,
        },
      });

      this.logger.log(
        `Finished ${document.originalName}: ${parsed.units.length} units, ${chunkCount} chunks, ${embeddingResult.embeddings.length} embeddings`,
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

  /*
   * Convert a numeric embedding into the textual
   * format accepted by pgvector:
   *
   * [0.123,-0.456,...]
   */
  private toVectorLiteral(embedding: number[]): string {
    if (embedding.length !== 384) {
      throw new Error(
        `Expected a 384-dimensional embedding, received ${embedding.length}`,
      );
    }

    if (embedding.some((value) => !Number.isFinite(value))) {
      throw new Error('Embedding contains non-finite numeric values');
    }

    return `[${embedding.join(',')}]`;
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

    /*
     * Copy Buffer bytes into a real
     * ArrayBuffer.
     *
     * This avoids Buffer<ArrayBufferLike>
     * vs BlobPart incompatibilities in
     * newer Node.js / TypeScript typings.
     */
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
