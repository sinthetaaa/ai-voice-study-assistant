import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, fetch } from 'undici';

export type QuestionType = 'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type ConceptDifficulty = 'FOUNDATIONAL' | 'INTERMEDIATE' | 'ADVANCED';

export type QuestionSourceChunk = {
  id: string;
  text: string;
  documentName: string;
  unitLabel: string | null;
};

export type QuestionGenerationConcept = {
  id: string;
  name: string;
  description: string;
  importance: number;
  difficulty: ConceptDifficulty;
  sourceChunks: QuestionSourceChunk[];
};

export type GeneratedQuestion = {
  type: QuestionType;
  difficulty: QuestionDifficulty;
  prompt: string;
  expectedAnswer: string;
  evidenceChunkIds: string[];
};

type QuestionApiResponse = {
  concept_id: string;

  questions: {
    type: QuestionType;
    difficulty: QuestionDifficulty;
    prompt: string;
    expected_answer: string;
    evidence_chunk_ids: string[];
  }[];
};

@Injectable()
export class QuestionAiClientService implements OnModuleDestroy {
  private readonly logger = new Logger(QuestionAiClientService.name);

  private readonly requestTimeoutMs = 30 * 60 * 1000;

  private readonly aiDispatcher = new Agent({
    headersTimeout: this.requestTimeoutMs,

    bodyTimeout: this.requestTimeoutMs,
  });

  constructor(private readonly configService: ConfigService) {}

  async onModuleDestroy(): Promise<void> {
    await this.aiDispatcher.close();
  }

  async generateQuestions(
    concept: QuestionGenerationConcept,
    requestedTypes: QuestionType[] = ['RECALL', 'UNDERSTANDING', 'APPLICATION'],
  ): Promise<GeneratedQuestion[]> {
    if (concept.sourceChunks.length === 0) {
      return [];
    }

    const uniqueRequestedTypes = Array.from(new Set(requestedTypes));

    this.validateRequestedTypes(uniqueRequestedTypes);

    const aiServiceUrl = this.configService
      .getOrThrow<string>('AI_SERVICE_URL')
      .replace(/\/$/, '');

    this.logger.log(
      `Requesting question generation for concept ` +
        `"${concept.name}" from ` +
        `${concept.sourceChunks.length} source chunks`,
    );

    let response: Awaited<ReturnType<typeof fetch>>;

    try {
      response = await fetch(`${aiServiceUrl}/questions/generate`, {
        method: 'POST',

        dispatcher: this.aiDispatcher,

        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          concept: {
            id: concept.id,

            name: concept.name,

            description: concept.description,

            importance: concept.importance,

            difficulty: concept.difficulty,

            source_chunks: concept.sourceChunks.map((chunk) => ({
              id: chunk.id,

              text: chunk.text,

              document_name: chunk.documentName,

              unit_label: chunk.unitLabel,
            })),
          },

          requested_types: uniqueRequestedTypes,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to call question generation service: ${message}`);
    }

    if (!response.ok) {
      const responseBody = await response.text();

      throw new Error(
        `Question generation service returned ` +
          `${response.status}: ${responseBody}`,
      );
    }

    const payload = (await response.json()) as QuestionApiResponse;

    return this.validateResponse(concept, uniqueRequestedTypes, payload);
  }

  private validateRequestedTypes(requestedTypes: QuestionType[]): void {
    const allowedTypes = new Set<QuestionType>([
      'RECALL',
      'UNDERSTANDING',
      'APPLICATION',
    ]);

    if (requestedTypes.length === 0) {
      throw new Error('At least one question type is required');
    }

    for (const questionType of requestedTypes) {
      if (!allowedTypes.has(questionType)) {
        throw new Error(`Unsupported question type: ${questionType}`);
      }
    }
  }

  private validateResponse(
    concept: QuestionGenerationConcept,
    requestedTypes: QuestionType[],
    payload: QuestionApiResponse,
  ): GeneratedQuestion[] {
    if (payload.concept_id !== concept.id) {
      throw new Error(
        'Question generation service returned ' + 'a mismatched concept ID',
      );
    }

    if (!Array.isArray(payload.questions)) {
      throw new Error(
        'Question generation service returned ' +
          'an invalid questions payload',
      );
    }

    const allowedChunkIds = new Set(
      concept.sourceChunks.map((chunk) => chunk.id),
    );

    const expectedDifficulty: Record<QuestionType, QuestionDifficulty> = {
      RECALL: 'EASY',

      UNDERSTANDING: 'MEDIUM',

      APPLICATION: 'HARD',
    };

    const questionsByType = new Map<QuestionType, GeneratedQuestion>();

    for (const question of payload.questions) {
      if (!requestedTypes.includes(question.type)) {
        throw new Error(
          `Question generation service returned ` +
            `unrequested type: ${question.type}`,
        );
      }

      if (questionsByType.has(question.type)) {
        throw new Error(
          `Question generation service returned ` +
            `duplicate type: ${question.type}`,
        );
      }

      if (question.difficulty !== expectedDifficulty[question.type]) {
        throw new Error(
          `Question ${question.type} returned ` +
            `unexpected difficulty ` +
            `${question.difficulty}`,
        );
      }

      if (
        typeof question.prompt !== 'string' ||
        question.prompt.trim().length === 0
      ) {
        throw new Error(`Question ${question.type} has ` + 'an invalid prompt');
      }

      if (
        typeof question.expected_answer !== 'string' ||
        question.expected_answer.trim().length === 0
      ) {
        throw new Error(
          `Question ${question.type} has ` + 'an invalid expected answer',
        );
      }

      if (
        !Array.isArray(question.evidence_chunk_ids) ||
        question.evidence_chunk_ids.length === 0
      ) {
        throw new Error(
          `Question ${question.type} has ` + 'no evidence chunks',
        );
      }

      const evidenceChunkIds = Array.from(new Set(question.evidence_chunk_ids));

      for (const chunkId of evidenceChunkIds) {
        if (typeof chunkId !== 'string' || !allowedChunkIds.has(chunkId)) {
          throw new Error(
            `Question ${question.type} returned ` +
              `invalid evidence chunk: ${String(chunkId)}`,
          );
        }
      }

      questionsByType.set(question.type, {
        type: question.type,

        difficulty: question.difficulty,

        prompt: question.prompt.trim(),

        expectedAnswer: question.expected_answer.trim(),

        evidenceChunkIds,
      });
    }

    const missingTypes = requestedTypes.filter(
      (questionType) => !questionsByType.has(questionType),
    );

    if (missingTypes.length > 0) {
      throw new Error(
        'Question generation service omitted ' +
          `question types: ${missingTypes.join(', ')}`,
      );
    }

    const result = requestedTypes.map((questionType) =>
      questionsByType.get(questionType)!,
    );

    this.logger.log(
      `Generated ${result.length} validated questions ` +
        `for concept "${concept.name}"`,
    );

    return result;
  }
}
