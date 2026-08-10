import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingClientService } from '../embeddings/embedding-client.service';

type SemanticSearchRow = {
  chunkId: string;

  chunkIndex: number;

  text: string;

  metadata: unknown;

  unitId: string;

  unitIndex: number;

  unitKind: string;

  unitLabel: string | null;

  documentId: string;

  documentName: string;

  similarity: number;
};

export type SemanticSearchResult = {
  query: string;

  count: number;

  results: SemanticSearchRow[];
};

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly embeddingClient: EmbeddingClientService,
  ) {}

  async searchStudyPack(
    studyPackId: string,
    query: string,
    limit: number,
  ): Promise<SemanticSearchResult> {
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

    const cleanedQuery = query.trim();

    const embeddingResult = await this.embeddingClient.embedQueries([
      cleanedQuery,
    ]);

    const queryEmbedding = embeddingResult.embeddings[0];

    if (!queryEmbedding) {
      throw new Error('Embedding service returned no query embedding');
    }

    const vectorLiteral = this.toVectorLiteral(queryEmbedding);

    /*
     * pgvector:
     *
     * embedding <=> query
     *
     * gives cosine distance.
     *
     * Similarity is therefore:
     *
     * 1 - cosine distance
     */
    const results = await this.prisma.$queryRaw<SemanticSearchRow[]>`
        SELECT
          dc.id AS "chunkId",
          dc."chunkIndex" AS "chunkIndex",
          dc.text AS "text",
          dc.metadata AS "metadata",

          du.id AS "unitId",
          du."unitIndex" AS "unitIndex",
          du.kind AS "unitKind",
          du.label AS "unitLabel",

          d.id AS "documentId",
          d."originalName" AS "documentName",

          (
            1 - (
              dc.embedding <=>
              ${vectorLiteral}::vector
            )
          )::double precision
            AS "similarity"

        FROM "DocumentChunk" dc

        INNER JOIN "DocumentUnit" du
          ON du.id = dc."unitId"

        INNER JOIN "Document" d
          ON d.id = du."documentId"

        WHERE
          d."studyPackId" = ${studyPackId}

          AND d.status = 'READY'

          AND dc.embedding IS NOT NULL

        ORDER BY
          dc.embedding <=>
          ${vectorLiteral}::vector

        LIMIT ${limit}
      `;

    return {
      query: cleanedQuery,

      count: results.length,

      results,
    };
  }

  private toVectorLiteral(embedding: number[]): string {
    if (embedding.length !== 384) {
      throw new Error(
        `Expected a 384-dimensional query embedding, received ${embedding.length}`,
      );
    }

    if (embedding.some((value) => !Number.isFinite(value))) {
      throw new Error('Query embedding contains non-finite numeric values');
    }

    return `[${embedding.join(',')}]`;
  }
}
