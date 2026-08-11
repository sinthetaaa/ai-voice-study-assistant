import { Injectable, NotFoundException } from '@nestjs/common';

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

export type ConceptPreviewResult = {
  studyPackId: string;
  documentCount: number;
  chunkCount: number;
  conceptCount: number;
  concepts: ExtractedConcept[];
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
          `Document ${documentId} was not found in Study Pack ${studyPackId}`,
        );
      }
    }

    const chunks = await this.prisma.$queryRaw<ConceptChunkRow[]>`
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

    if (chunks.length === 0) {
      return {
        studyPackId,
        documentCount: 0,
        chunkCount: 0,
        conceptCount: 0,
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
      studyPackId,

      documentCount,

      chunkCount: chunks.length,

      conceptCount: concepts.length,

      concepts,
    };
  }
}
