import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  ConceptAiClientService,
  ConceptSourceChunk,
  ExtractedConcept,
} from './concept-ai-client.service';

type ConceptChunkRow = {
  id: string;
  text: string;
  documentId: string;
  documentName: string;
  unitLabel: string | null;
};

type ConceptExtractionBundle = {
  chunks: ConceptChunkRow[];
  documentCount: number;
  concepts: ExtractedConcept[];
};

type PreparedConcept = ExtractedConcept & {
  normalizedName: string;
};

export type ConceptPreviewResult = {
  studyPackId: string;
  documentCount: number;
  chunkCount: number;
  conceptCount: number;
  concepts: ExtractedConcept[];
};

export type ConceptGenerationResult = ConceptPreviewResult & {
  scopeDocumentId: string | null;
  persistedConceptCount: number;
  persistedSourceCount: number;
};

@Injectable()
export class ConceptsService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly conceptAiClient: ConceptAiClientService,
  ) {}

  async previewStudyPackConcepts(
    studyPackId: string,
    documentId?: string,
  ): Promise<ConceptPreviewResult> {
    const extraction = await this.extractStudyPackConcepts(
      studyPackId,
      documentId,
    );

    return {
      studyPackId,

      documentCount: extraction.documentCount,

      chunkCount: extraction.chunks.length,

      conceptCount: extraction.concepts.length,

      concepts: extraction.concepts,
    };
  }

  async generateStudyPackConcepts(
    studyPackId: string,
    documentId?: string,
  ): Promise<ConceptGenerationResult> {
    const extraction = await this.extractStudyPackConcepts(
      studyPackId,
      documentId,
    );

    if (extraction.chunks.length === 0) {
      throw new BadRequestException(
        documentId
          ? `Document ${documentId} has no READY ` +
              'chunks available for concept generation'
          : `Study Pack ${studyPackId} has no READY ` +
              'chunks available for concept generation',
      );
    }

    if (extraction.concepts.length === 0) {
      throw new BadRequestException(
        'Concept extraction returned no concepts; ' +
          'existing persisted concepts were not modified',
      );
    }

    const persistenceResult = await this.persistConcepts(
      studyPackId,
      extraction.chunks,
      extraction.concepts,
      documentId,
    );

    return {
      studyPackId,

      documentCount: extraction.documentCount,

      chunkCount: extraction.chunks.length,

      conceptCount: extraction.concepts.length,

      concepts: extraction.concepts,

      scopeDocumentId: documentId ?? null,

      persistedConceptCount: persistenceResult.persistedConceptCount,

      persistedSourceCount: persistenceResult.persistedSourceCount,
    };
  }

  private async extractStudyPackConcepts(
    studyPackId: string,
    documentId?: string,
  ): Promise<ConceptExtractionBundle> {
    const chunks = await this.loadStudyPackChunks(studyPackId, documentId);

    if (chunks.length === 0) {
      return {
        chunks: [],
        documentCount: 0,
        concepts: [],
      };
    }

    const sourceChunks: ConceptSourceChunk[] = chunks.map((chunk) => ({
      id: chunk.id,

      text: chunk.text,

      documentName: chunk.documentName,

      unitLabel: chunk.unitLabel,
    }));

    const concepts = await this.conceptAiClient.extractConcepts(sourceChunks);

    const documentCount = new Set(chunks.map((chunk) => chunk.documentId)).size;

    return {
      chunks,
      documentCount,
      concepts,
    };
  }

  private async loadStudyPackChunks(
    studyPackId: string,
    documentId?: string,
  ): Promise<ConceptChunkRow[]> {
    const studyPack = await this.prisma.studyPack.findUnique({
      where: {
        id: studyPackId,
      },

      select: {
        id: true,
      },
    });

    if (!studyPack) {
      throw new NotFoundException(`Study Pack ${studyPackId} was not found`);
    }

    if (documentId) {
      const document = await this.prisma.document.findFirst({
        where: {
          id: documentId,

          studyPackId,
        },

        select: {
          id: true,
        },
      });

      if (!document) {
        throw new NotFoundException(
          `Document ${documentId} was not found ` +
            `in Study Pack ${studyPackId}`,
        );
      }
    }

    return this.prisma.$queryRaw<ConceptChunkRow[]>`
      SELECT
        dc.id AS "id",
        dc.text AS "text",
        d.id AS "documentId",
        d."originalName" AS "documentName",
        du.label AS "unitLabel"
      FROM "DocumentChunk" dc
      INNER JOIN "DocumentUnit" du
        ON du.id = dc."unitId"
      INNER JOIN "Document" d
        ON d.id = du."documentId"
      WHERE
        d."studyPackId" = ${studyPackId}
        AND d.status = 'READY'
        AND (
          ${documentId ?? null}::text IS NULL
          OR d.id = ${documentId ?? null}
        )
      ORDER BY
        d.id,
        du."unitIndex",
        dc."chunkIndex"
    `;
  }

  private async persistConcepts(
    studyPackId: string,
    chunks: ConceptChunkRow[],
    concepts: ExtractedConcept[],
    documentId?: string,
  ): Promise<{
    persistedConceptCount: number;
    persistedSourceCount: number;
  }> {
    const preparedConcepts = this.prepareConceptsForPersistence(concepts);

    const scopeChunkIds = chunks.map((chunk) => chunk.id);

    await this.prisma.$transaction(async (transaction) => {
      /*
       * IMPORTANT:
       *
       * Concept rows now have stable identity.
       *
       * We never delete/recreate the whole
       * generated concept set merely to refresh
       * extraction output.
       *
       * QuestionAttempt and MasteryEvent history
       * can depend on these Concept identities.
       */

      if (documentId) {
        /*
         * Document-scoped regeneration:
         *
         * Remove only provenance contributed by
         * this document's chunks.
         */
        await transaction.conceptSource.deleteMany({
          where: {
            chunkId: {
              in: scopeChunkIds,
            },
          },
        });
      } else {
        /*
         * Full Study Pack regeneration:
         *
         * The new extraction is authoritative
         * for ACTIVE provenance, but Concept
         * identities themselves remain stable.
         *
         * Remove existing ConceptSource rows
         * instead of deleting Concept rows.
         */
        await transaction.conceptSource.deleteMany({
          where: {
            concept: {
              studyPackId,
            },
          },
        });
      }

      for (const concept of preparedConcepts) {
        /*
         * Always upsert by deterministic
         * normalized identity.
         *
         * This applies to BOTH:
         *
         * - document-scoped generation
         * - full Study Pack generation
         *
         * Therefore a surviving concept retains
         * the same Concept.id.
         */
        const persistedConcept = await transaction.concept.upsert({
          where: {
            studyPackId_normalizedName: {
              studyPackId,

              normalizedName: concept.normalizedName,
            },
          },

          update: {
            name: concept.name,

            description: concept.description,

            importance: concept.importance,

            difficulty: concept.difficulty,
          },

          create: {
            studyPackId,

            name: concept.name,

            normalizedName: concept.normalizedName,

            description: concept.description,

            importance: concept.importance,

            difficulty: concept.difficulty,
          },

          select: {
            id: true,
          },
        });

        await transaction.conceptSource.createMany({
          data: concept.supportingChunkIds.map((chunkId) => ({
            conceptId: persistedConcept.id,

            chunkId,

            relevance: 1.0,
          })),

          skipDuplicates: true,
        });
      }

      /*
       * Some concepts may no longer appear after
       * regeneration and therefore have no active
       * ConceptSource rows.
       *
       * Delete them ONLY when doing so cannot
       * destroy learner or session history.
       *
       * Historical concepts with attempts,
       * mastery history, or StudySession history
       * remain in the database even when they are
       * no longer active in the current extraction.
       */
      await transaction.concept.deleteMany({
        where: {
          studyPackId,

          sources: {
            none: {},
          },

          mastery: {
            is: null,
          },

          masteryEvents: {
            none: {},
          },

          questions: {
            none: {
              attempts: {
                some: {},
              },
            },
          },

          /*
           * A concept referenced by any
           * SessionConceptProgress row is part of
           * historical session state and must keep
           * its stable identity.
           */
          sessionProgress: {
            none: {},
          },

          /*
           * Protect the StudySession.currentConcept
           * relation independently as well.
           *
           * Normally sessionProgress should already
           * cover this, but this keeps deletion safe
           * even if session data becomes partially
           * inconsistent.
           */
          currentInSessions: {
            none: {},
          },
        },
      });
    });

    /*
     * Count ACTIVE concepts rather than all
     * historical Concept rows.
     *
     * A historical source-less concept may remain
     * intentionally because learner or session
     * history points to it.
     */
    const [persistedConceptCount, persistedSourceCount] =
      await this.prisma.$transaction([
        this.prisma.concept.count({
          where: {
            studyPackId,

            sources: {
              some: {},
            },
          },
        }),

        this.prisma.conceptSource.count({
          where: {
            concept: {
              studyPackId,
            },
          },
        }),
      ]);

    return {
      persistedConceptCount,
      persistedSourceCount,
    };
  }

  private prepareConceptsForPersistence(
    concepts: ExtractedConcept[],
  ): PreparedConcept[] {
    const seenNormalizedNames = new Map<string, string>();

    return concepts.map((concept) => {
      const normalizedName = this.normalizeConceptName(concept.name);

      if (!normalizedName) {
        throw new BadRequestException(
          `Concept "${concept.name}" cannot be ` +
            'normalized to a valid persistence key',
        );
      }

      const previousName = seenNormalizedNames.get(normalizedName);

      if (previousName) {
        throw new BadRequestException(
          'Concept persistence received duplicate ' +
            `normalized names: "${previousName}" ` +
            `and "${concept.name}"`,
        );
      }

      seenNormalizedNames.set(normalizedName, concept.name);

      return {
        ...concept,
        normalizedName,
      };
    });
  }

  private normalizeConceptName(name: string): string {
    let normalized = name.normalize('NFKC').trim().toLowerCase();

    /*
     * Remove a trailing short acronym:
     *
     * "Explainable AI (XAI)"
     * becomes
     * "Explainable AI"
     *
     * This mirrors the deterministic
     * normalization used by the AI service.
     */
    normalized = normalized.replace(/\s*\([a-z0-9-]{2,15}\)\s*$/, '');

    normalized = normalized.replace(/&/g, ' and ');

    normalized = normalized.replace(/[-_/]+/g, ' ');

    normalized = normalized.replace(/[^a-z0-9\s]/g, '');

    normalized = normalized.replace(/\s+/g, ' ');

    return normalized.trim();
  }
}
