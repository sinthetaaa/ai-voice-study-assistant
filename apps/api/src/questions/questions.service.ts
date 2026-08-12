import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  GeneratedQuestion,
  QuestionAiClientService,
  QuestionGenerationConcept,
  QuestionSourceChunk,
} from './question-ai-client.service';

type LoadedConcept = {
  id: string;
  name: string;
  description: string;
  importance: number;
  difficulty: 'FOUNDATIONAL' | 'INTERMEDIATE' | 'ADVANCED';

  sourceChunks: QuestionSourceChunk[];
};

type QuestionGenerationBundle = {
  concept: LoadedConcept;
  questions: GeneratedQuestion[];
};

export type QuestionPreviewResult = {
  studyPackId: string;
  conceptId: string;
  conceptName: string;
  sourceChunkCount: number;
  questionCount: number;
  questions: GeneratedQuestion[];
};

export type QuestionGenerationResult = QuestionPreviewResult & {
  persistedQuestionCount: number;
  persistedSourceCount: number;
};

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly questionAiClient: QuestionAiClientService,
  ) {}

  async previewConceptQuestions(
    studyPackId: string,
    conceptId: string,
  ): Promise<QuestionPreviewResult> {
    const generation = await this.generateQuestionBundle(
      studyPackId,
      conceptId,
    );

    return this.buildPreviewResult(studyPackId, generation);
  }

  async generateConceptQuestions(
    studyPackId: string,
    conceptId: string,
  ): Promise<QuestionGenerationResult> {
    /*
     * Generate and validate everything BEFORE
     * modifying persisted questions.
     *
     * If the AI service fails or returns invalid
     * output, the currently persisted question
     * set remains untouched.
     */
    const generation = await this.generateQuestionBundle(
      studyPackId,
      conceptId,
    );

    if (generation.questions.length === 0) {
      throw new BadRequestException(
        'Question generation returned no ' +
          'questions; existing persisted ' +
          'questions were not modified',
      );
    }

    const persistenceResult = await this.persistQuestions(
      generation.concept,
      generation.questions,
    );

    return {
      ...this.buildPreviewResult(studyPackId, generation),

      persistedQuestionCount: persistenceResult.persistedQuestionCount,

      persistedSourceCount: persistenceResult.persistedSourceCount,
    };
  }

  private async generateQuestionBundle(
    studyPackId: string,
    conceptId: string,
  ): Promise<QuestionGenerationBundle> {
    const concept = await this.loadConcept(studyPackId, conceptId);

    if (concept.sourceChunks.length === 0) {
      throw new BadRequestException(
        `Concept ${conceptId} has no READY ` +
          'supporting chunks available for ' +
          'question generation',
      );
    }

    const aiConcept: QuestionGenerationConcept = {
      id: concept.id,

      name: concept.name,

      description: concept.description,

      importance: concept.importance,

      difficulty: concept.difficulty,

      sourceChunks: concept.sourceChunks,
    };

    const questions = await this.questionAiClient.generateQuestions(aiConcept);

    if (questions.length === 0) {
      throw new BadRequestException(
        'Question generation returned no ' + 'questions',
      );
    }

    return {
      concept,
      questions,
    };
  }

  private buildPreviewResult(
    studyPackId: string,
    generation: QuestionGenerationBundle,
  ): QuestionPreviewResult {
    return {
      studyPackId,

      conceptId: generation.concept.id,

      conceptName: generation.concept.name,

      sourceChunkCount: generation.concept.sourceChunks.length,

      questionCount: generation.questions.length,

      questions: generation.questions,
    };
  }

  private async persistQuestions(
    concept: LoadedConcept,
    questions: GeneratedQuestion[],
  ): Promise<{
    persistedQuestionCount: number;
    persistedSourceCount: number;
  }> {
    const allowedChunkIds = new Set(
      concept.sourceChunks.map((chunk) => chunk.id),
    );

    /*
     * Revalidate provenance directly at the
     * persistence boundary.
     *
     * The AI client already performs this check,
     * but persisted provenance should never rely
     * solely on upstream validation.
     */
    for (const question of questions) {
      if (question.evidenceChunkIds.length === 0) {
        throw new BadRequestException(
          `Question ${question.type} has ` + 'no evidence chunks',
        );
      }

      for (const chunkId of question.evidenceChunkIds) {
        if (!allowedChunkIds.has(chunkId)) {
          throw new BadRequestException(
            `Question ${question.type} ` +
              'contains evidence outside ' +
              'the concept provenance: ' +
              chunkId,
          );
        }
      }
    }

    /*
     * Also protect the stable identity invariant:
     *
     * one persisted question per
     * (conceptId, questionType).
     */
    const seenTypes = new Set<string>();

    for (const question of questions) {
      if (seenTypes.has(question.type)) {
        throw new BadRequestException(
          `Question persistence received ` + `duplicate type ${question.type}`,
        );
      }

      seenTypes.add(question.type);
    }

    await this.prisma.$transaction(async (transaction) => {
      for (const question of questions) {
        /*
         * IMPORTANT:
         *
         * Do not delete/recreate Question rows.
         *
         * QuestionAttempt points to Question
         * with ON DELETE RESTRICT, and historical
         * learner attempts must retain a stable
         * question identity.
         *
         * The composite unique key:
         *
         * (conceptId, type)
         *
         * gives each concept exactly one stable
         * RECALL, UNDERSTANDING and APPLICATION
         * question slot.
         */
        const persistedQuestion = await transaction.question.upsert({
          where: {
            conceptId_type: {
              conceptId: concept.id,

              type: question.type,
            },
          },

          update: {
            difficulty: question.difficulty,

            prompt: question.prompt,

            expectedAnswer: question.expectedAnswer,
          },

          create: {
            conceptId: concept.id,

            type: question.type,

            difficulty: question.difficulty,

            prompt: question.prompt,

            expectedAnswer: question.expectedAnswer,
          },

          select: {
            id: true,
          },
        });

        /*
         * The Question row stays stable, but
         * provenance should represent the latest
         * generated version of that question.
         *
         * Historical attempts already snapshot
         * the evidenceChunkIds that existed at
         * the moment the learner answered.
         */
        await transaction.questionSource.deleteMany({
          where: {
            questionId: persistedQuestion.id,
          },
        });

        await transaction.questionSource.createMany({
          data: question.evidenceChunkIds.map((chunkId) => ({
            questionId: persistedQuestion.id,

            chunkId,

            relevance: 1.0,
          })),

          skipDuplicates: true,
        });
      }
    });

    const [persistedQuestionCount, persistedSourceCount] =
      await this.prisma.$transaction([
        this.prisma.question.count({
          where: {
            conceptId: concept.id,
          },
        }),

        this.prisma.questionSource.count({
          where: {
            question: {
              conceptId: concept.id,
            },
          },
        }),
      ]);

    return {
      persistedQuestionCount,
      persistedSourceCount,
    };
  }

  private async loadConcept(
    studyPackId: string,
    conceptId: string,
  ): Promise<LoadedConcept> {
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

    const concept = await this.prisma.concept.findFirst({
      where: {
        id: conceptId,

        studyPackId,
      },

      select: {
        id: true,

        name: true,

        description: true,

        importance: true,

        difficulty: true,

        sources: {
          orderBy: {
            createdAt: 'asc',
          },

          select: {
            chunk: {
              select: {
                id: true,

                text: true,

                unit: {
                  select: {
                    label: true,

                    document: {
                      select: {
                        originalName: true,

                        status: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!concept) {
      throw new NotFoundException(
        `Concept ${conceptId} was not found ` + `in Study Pack ${studyPackId}`,
      );
    }

    const seenChunkIds = new Set<string>();

    const sourceChunks: QuestionSourceChunk[] = [];

    for (const source of concept.sources) {
      const chunk = source.chunk;

      if (chunk.unit.document.status !== 'READY') {
        continue;
      }

      if (seenChunkIds.has(chunk.id)) {
        continue;
      }

      seenChunkIds.add(chunk.id);

      sourceChunks.push({
        id: chunk.id,

        text: chunk.text,

        documentName: chunk.unit.document.originalName,

        unitLabel: chunk.unit.label,
      });
    }

    return {
      id: concept.id,

      name: concept.name,

      description: concept.description,

      importance: concept.importance,

      difficulty: concept.difficulty,

      sourceChunks,
    };
  }
}
