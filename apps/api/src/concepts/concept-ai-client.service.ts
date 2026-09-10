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


export type HierarchyAtomicConcept = {
  id: string;
  name: string;
  description: string;
  importance: number;
  difficulty:
    | 'FOUNDATIONAL'
    | 'INTERMEDIATE'
    | 'ADVANCED';
};

export type GeneratedCoreConcept = {
  name: string;
  description: string;
  importance: number;
  atomicConceptIds: string[];
};

export type GeneratedStudyTopic = {
  name: string;
  description: string | null;
  coreConcepts: GeneratedCoreConcept[];
};

export type GeneratedConceptHierarchy = {
  topics: GeneratedStudyTopic[];
};

type ConceptHierarchyApiResponse = {
  topics: {
    name: string;
    description: string | null;
    core_concepts: {
      name: string;
      description: string;
      importance: number;
      atomic_concept_ids: string[];
    }[];
  }[];
};

@Injectable()
export class ConceptAiClientService implements OnModuleDestroy {
  private readonly logger = new Logger(ConceptAiClientService.name);

  private readonly requestTimeoutMs = 30 * 60 * 1000;

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

    const conceptAiStartedAt = Date.now();

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

    const conceptAiElapsedMs = Date.now() - conceptAiStartedAt;

    this.logger.log(
      `[StudyLoopTiming] concept AI response: ${(conceptAiElapsedMs / 1000).toFixed(2)}s for ${chunks.length} chunks`,
    );

    if (!response.ok) {
      const responseBody = await response.text();

      throw new Error(
        `Concept extraction service returned ${response.status}: ${responseBody}`,
      );
    }

    const parseStartedAt = Date.now();

    const payload = (await response.json()) as ConceptApiResponse;

    this.logger.log(
      `[StudyLoopTiming] concept response JSON parse: ${((Date.now() - parseStartedAt) / 1000).toFixed(3)}s`,
    );

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

    this.logger.log(
      `[StudyLoopTiming] concept client total: ${((Date.now() - conceptAiStartedAt) / 1000).toFixed(2)}s`,
    );

    return concepts;
  }

  async generateHierarchy(
    concepts: HierarchyAtomicConcept[],
  ): Promise<GeneratedConceptHierarchy> {
    if (concepts.length === 0) {
      throw new Error(
        'Cannot generate hierarchy without atomic concepts',
      );
    }

    const aiServiceUrl = this.configService
      .getOrThrow<string>('AI_SERVICE_URL')
      .replace(/\/$/, '');

    this.logger.log(
      `Requesting concept hierarchy for ${concepts.length} atomic concepts`,
    );

    const startedAt = Date.now();

    let response:
      Awaited<ReturnType<typeof fetch>>;

    try {
      response = await fetch(
        `${aiServiceUrl}/concepts/hierarchy`,
        {
          method: 'POST',
          dispatcher: this.aiDispatcher,
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            concepts,
          }),
        },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      throw new Error(
        'Failed to call concept hierarchy service: ' +
          message,
      );
    }

    this.logger.log(
      `[StudyLoopTiming] concept hierarchy AI response: ${(
        (Date.now() - startedAt) /
        1000
      ).toFixed(2)}s for ${concepts.length} atomic concepts`,
    );

    if (!response.ok) {
      const responseBody =
        await response.text();

      throw new Error(
        `Concept hierarchy service returned ${response.status}: ${responseBody}`,
      );
    }

    const payload =
      (await response.json()) as
        ConceptHierarchyApiResponse;

    if (
      !payload ||
      !Array.isArray(payload.topics) ||
      payload.topics.length === 0
    ) {
      throw new Error(
        'Concept hierarchy service returned an invalid topics payload',
      );
    }

    const topics = payload.topics.map(
      (topic) => {
        if (
          typeof topic.name !==
            'string' ||
          !topic.name.trim() ||
          (
            topic.description !== null &&
            typeof topic.description !==
              'string'
          ) ||
          !Array.isArray(
            topic.core_concepts,
          ) ||
          topic.core_concepts.length ===
            0
        ) {
          throw new Error(
            'Concept hierarchy service returned an invalid Study Topic',
          );
        }

        const coreConcepts =
          topic.core_concepts.map(
            (coreConcept) => {
              if (
                typeof coreConcept.name !==
                  'string' ||
                !coreConcept.name.trim() ||
                typeof coreConcept.description !==
                  'string' ||
                !coreConcept.description.trim() ||
                !Number.isInteger(
                  coreConcept.importance,
                ) ||
                coreConcept.importance < 1 ||
                coreConcept.importance > 5 ||
                !Array.isArray(
                  coreConcept
                    .atomic_concept_ids,
                ) ||
                coreConcept
                  .atomic_concept_ids
                  .length === 0 ||
                coreConcept
                  .atomic_concept_ids
                  .some(
                    (conceptId) =>
                      typeof conceptId !==
                        'string' ||
                      !conceptId.trim(),
                  )
              ) {
                throw new Error(
                  'Concept hierarchy service returned an invalid Core Concept',
                );
              }

              return {
                name: coreConcept.name,
                description:
                  coreConcept.description,
                importance:
                  coreConcept.importance,
                /*
                 * Do NOT deduplicate IDs.
                 *
                 * Nest deterministic validation
                 * must see duplicate membership.
                 */
                atomicConceptIds: [
                  ...coreConcept
                    .atomic_concept_ids,
                ],
              };
            },
          );

        return {
          name: topic.name,
          description:
            topic.description,
          coreConcepts,
        };
      },
    );

    return {
      topics,
    };
  }

}
