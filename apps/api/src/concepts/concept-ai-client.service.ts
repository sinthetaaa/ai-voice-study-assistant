import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, fetch } from 'undici';

export type ConceptSourceChunk = {
  id: string;
  text: string;
  documentName: string;
  unitLabel: string | null;
};

export type ExtractedConcept = {
  name: string;
  description: string;
  importance: number;
  difficulty: 'FOUNDATIONAL' | 'INTERMEDIATE' | 'ADVANCED';
  supportingChunkIds: string[];
};

type ConceptApiResponse = {
  concepts: {
    name: string;
    description: string;
    importance: number;
    difficulty: 'FOUNDATIONAL' | 'INTERMEDIATE' | 'ADVANCED';
    supporting_chunk_ids: string[];
  }[];
};

@Injectable()
export class ConceptAiClientService implements OnModuleDestroy {
  private readonly logger = new Logger(ConceptAiClientService.name);

  private readonly requestTimeoutMs = 15 * 60 * 1000;

  private readonly aiDispatcher = new Agent({
    headersTimeout: this.requestTimeoutMs,
    bodyTimeout: this.requestTimeoutMs,
  });

  constructor(private readonly configService: ConfigService) {}

  async onModuleDestroy(): Promise<void> {
    await this.aiDispatcher.close();
  }

  async extractConcepts(
    chunks: ConceptSourceChunk[],
  ): Promise<ExtractedConcept[]> {
    if (chunks.length === 0) {
      return [];
    }

    const aiServiceUrl = this.configService
      .getOrThrow<string>('AI_SERVICE_URL')
      .replace(/\/$/, '');

    this.logger.log(
      `Requesting concept extraction for ${chunks.length} chunks`,
    );

    let response: Awaited<ReturnType<typeof fetch>>;

    try {
      response = await fetch(`${aiServiceUrl}/concepts/extract`, {
        method: 'POST',

        dispatcher: this.aiDispatcher,

        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          chunks: chunks.map((chunk) => ({
            id: chunk.id,
            text: chunk.text,
            document_name: chunk.documentName,
            unit_label: chunk.unitLabel,
          })),
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to call concept extraction service: ${message}`);
    }

    if (!response.ok) {
      const responseBody = await response.text();

      throw new Error(
        `Concept extraction service returned ${response.status}: ${responseBody}`,
      );
    }

    const payload = (await response.json()) as ConceptApiResponse;

    if (!Array.isArray(payload.concepts)) {
      throw new Error(
        'Concept extraction service returned an invalid concepts payload',
      );
    }

    const allowedChunkIds = new Set(chunks.map((chunk) => chunk.id));

    const concepts = payload.concepts.map((concept) => {
      if (
        typeof concept.name !== 'string' ||
        typeof concept.description !== 'string' ||
        !Number.isInteger(concept.importance) ||
        concept.importance < 1 ||
        concept.importance > 5 ||
        !['FOUNDATIONAL', 'INTERMEDIATE', 'ADVANCED'].includes(
          concept.difficulty,
        ) ||
        !Array.isArray(concept.supporting_chunk_ids)
      ) {
        throw new Error(
          'Concept extraction service returned an invalid concept',
        );
      }

      const supportingChunkIds = concept.supporting_chunk_ids.filter(
        (chunkId) =>
          typeof chunkId === 'string' && allowedChunkIds.has(chunkId),
      );

      if (supportingChunkIds.length === 0) {
        throw new Error(
          `Concept "${concept.name}" has no valid supporting chunks`,
        );
      }

      return {
        name: concept.name,
        description: concept.description,
        importance: concept.importance,
        difficulty: concept.difficulty,
        supportingChunkIds: Array.from(new Set(supportingChunkIds)),
      };
    });

    this.logger.log(
      `Extracted ${concepts.length} concepts from ${chunks.length} chunks`,
    );

    return concepts;
  }
}
