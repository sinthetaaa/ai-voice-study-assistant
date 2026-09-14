import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { ChunkingService } from '../chunking/chunking.service';
import { EmbeddingClientService } from '../embeddings/embedding-client.service';
import { ConceptsService } from '../concepts/concepts.service';
import { IngestionQueueService } from './ingestion-queue.service';

import {
  DOCUMENT_INGESTION_QUEUE,
  GENERATE_STUDY_PACK_HIERARCHY_JOB,
  PROCESS_DOCUMENT_JOB,
} from './ingestion.constants';

import {
  GenerateStudyPackHierarchyJobData,
  IngestionJobData,
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

    private readonly conceptsService: ConceptsService,
    private readonly ingestionQueueService: IngestionQueueService,
  ) {
    super();
  }

  async process(job: Job<IngestionJobData>): Promise<void> {
    if (job.name === GENERATE_STUDY_PACK_HIERARCHY_JOB) {
      const hierarchyJob = job.data as GenerateStudyPackHierarchyJobData;

      try {
        await this.conceptsService.tryGenerateStudyPackHierarchy(
          hierarchyJob.studyPackId,
        );
      } catch (error) {
        /*
         * A hierarchy job may still be queued or running
         * after its Study Pack has been deleted.
         *
         * Suppress only that stale-job case. Real hierarchy
         * failures for an existing Study Pack must still retry.
         */
        try {
          const studyPack = await this.prisma.studyPack.findUnique({
            where: {
              id: hierarchyJob.studyPackId,
            },
            select: {
              id: true,
            },
          });

          if (!studyPack) {
            this.logger.log(
              `Skipping hierarchy generation for deleted Study Pack ` +
                hierarchyJob.studyPackId,
            );
            return;
          }
        } catch {
          throw error;
        }

        throw error;
      }

      return;
    }

    if (job.name !== PROCESS_DOCUMENT_JOB) {
      throw new Error(`Unsupported ingestion job: ${job.name}`);
    }

    const documentJob = job.data as ProcessDocumentJobData;

    const document = await this.prisma.document.findUnique({
      where: {
        id: documentJob.documentId,
      },
    });

    if (!document) {
      this.logger.log(`Skipping deleted document ${documentJob.documentId}`);
      return;
    }

    this.logger.log(`Processing ${document.originalName} (${document.id})`);

    let documentContentReady = false;

    try {
      await this.prisma.document.update({
        where: {
          id: document.id,
        },

        data: {
          status: 'PROCESSING',
          errorMessage: null,
          conceptStatus: 'PENDING',
          conceptErrorMessage: null,
        },
      });

      if (!document.storageKey) {
        throw new Error(`Document ${document.id} has no storage key`);
      }
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

      documentContentReady = true;

      this.logger.log(
        `Finished ${document.originalName}: ${parsed.units.length} units, ${chunkCount} chunks, ${embeddingResult.embeddings.length} embeddings`,
      );

      /*
       * ------------------------------------------------
       * 9. Extract + persist concepts
       * ------------------------------------------------
       *
       * Document READY means parsing, chunking and
       * embeddings are complete.
       *
       * Study readiness, however, requires ACTIVE
       * concepts. Generate them automatically for
       * this document so a normal upload flows all
       * the way into a usable study session.
       *
       * Use document-scoped generation here rather
       * than regenerating the whole Study Pack.
       * This also makes multi-document uploads safer:
       * each completed ingestion contributes its own
       * concept provenance.
       */

      await this.prisma.document.update({
        where: {
          id: document.id,
        },
        data: {
          conceptStatus: 'PROCESSING',
          conceptErrorMessage: null,
        },
      });

      this.logger.log(
        `Generating concepts for ${document.originalName} (${document.id})`,
      );

      const conceptResult =
        await this.conceptsService.generateStudyPackConcepts(
          document.studyPackId,
          document.id,
        );

      await this.prisma.document.update({
        where: {
          id: document.id,
        },
        data: {
          conceptStatus: 'READY',
          conceptErrorMessage: null,
        },
      });

      this.logger.log(
        `Concept generation finished for ${document.originalName}: ` +
          `${conceptResult.conceptCount} extracted, ` +
          `${conceptResult.persistedConceptCount} active concepts`,
      );

      await this.enqueueHierarchyGenerationSafely(document.studyPackId);
    } catch (error) {
      /*
       * The Study Pack or Document may be deleted while this
       * worker is parsing, embedding, or generating concepts.
       *
       * If PostgreSQL confirms that the Document no longer
       * exists, deletion owns the lifecycle and this stale
       * BullMQ job should finish successfully rather than retry.
       *
       * If the existence check itself fails, preserve the
       * original processing failure and normal retry behaviour.
       */
      try {
        const existingDocument = await this.prisma.document.findUnique({
          where: {
            id: document.id,
          },
          select: {
            id: true,
          },
        });

        if (!existingDocument) {
          this.logger.log(
            `Stopping stale ingestion job for deleted document ${document.id}`,
          );
          return;
        }
      } catch {
        throw error;
      }

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

          data: documentContentReady
            ? {
                /*
                 * File parsing/chunking/embedding succeeded.
                 * Only concept processing failed.
                 */
                status: 'READY',
                errorMessage: null,
                conceptStatus: 'FAILED',
                conceptErrorMessage: message,
              }
            : {
                /*
                 * Material ingestion itself failed.
                 */
                status: 'FAILED',
                errorMessage: message,
                conceptStatus: 'FAILED',
                conceptErrorMessage: message,
              },
        });

        if (documentContentReady) {
          this.logger.error(
            `Concept processing permanently failed for ${document.originalName}: ${message}`,
          );
        } else {
          this.logger.error(
            `Ingestion permanently failed for ${document.originalName}: ${message}`,
          );
        }

        /*
         * FAILED is a settled concept state.
         *
         * This may be the last document preventing the
         * Study Pack hierarchy from being generated.
         */
        await this.enqueueHierarchyGenerationSafely(document.studyPackId);
      } else {
        this.logger.warn(
          `Ingestion attempt ${currentAttempt}/${totalAttempts} failed for ${document.originalName}: ${message}`,
        );
      }

      throw error;
    }
  }

  private async enqueueHierarchyGenerationSafely(
    studyPackId: string,
  ): Promise<void> {
    try {
      await this.ingestionQueueService.enqueueStudyPackHierarchy(studyPackId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      /*
       * Queue scheduling failure must not cause the
       * expensive document pipeline to run again.
       *
       * The hierarchy remains DIRTY/FAILED and can be
       * retried by another settlement event or through
       * the explicit hierarchy endpoint.
       */
      this.logger.error(
        `Could not enqueue hierarchy generation for ` +
          `Study Pack ${studyPackId}: ${message}`,
      );
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
