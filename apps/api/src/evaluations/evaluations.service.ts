import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  MasteryApplicationResult,
  MasteryService,
} from '../mastery/mastery.service';
import { PrismaService } from '../prisma/prisma.service';

import {
  AnswerEvaluationResult,
  EvaluationAiClientService,
  EvaluationEvidenceChunk,
} from './evaluation-ai-client.service';

export type MasteryUpdateStatus = 'APPLIED' | 'ALREADY_APPLIED' | 'PENDING';

type PersistedEvaluationRecord = {
  studyPackId: string;

  conceptId: string;

  questionId: string;

  attemptId: string;

  evaluationId: string;

  questionType: 'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

  difficulty: 'EASY' | 'MEDIUM' | 'HARD';

  answerText: string;

  score: number;

  correctness: 'CORRECT' | 'PARTIAL' | 'INCORRECT';

  feedback: string;

  missingPoints: string[];

  misconceptions: string[];

  evaluatorProvider: string;

  evaluatorModel: string;

  evaluatorVersion: string;

  createdAt: Date;
};

export type PersistedEvaluationResult = PersistedEvaluationRecord & {
  masteryStatus: MasteryUpdateStatus;

  mastery: MasteryApplicationResult | null;
};

@Injectable()
export class EvaluationsService {
  private static readonly MAX_ANSWER_LENGTH = 12_000;

  private readonly logger = new Logger(EvaluationsService.name);

  constructor(
    private readonly prisma: PrismaService,

    private readonly evaluationAiClient: EvaluationAiClientService,

    private readonly masteryService: MasteryService,
  ) {}

  async evaluateQuestion(
    studyPackId: string,
    conceptId: string,
    questionId: string,
    rawAnswerText: unknown,
  ): Promise<PersistedEvaluationResult> {
    const answerText = this.validateAnswerText(rawAnswerText);

    /*
     * Load the exact persisted question and
     * provenance BEFORE calling the evaluator.
     *
     * These values become immutable attempt
     * snapshots if evaluation succeeds.
     */
    const question = await this.prisma.question.findFirst({
      where: {
        id: questionId,

        conceptId,

        concept: {
          studyPackId,
        },
      },

      select: {
        id: true,

        type: true,

        difficulty: true,

        prompt: true,

        expectedAnswer: true,

        concept: {
          select: {
            id: true,
            name: true,
            studyPackId: true,
          },
        },

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

    if (!question) {
      throw new NotFoundException(
        `Question ${questionId} was not found ` +
          `for concept ${conceptId} in Study Pack ` +
          studyPackId,
      );
    }

    const evidenceChunks: EvaluationEvidenceChunk[] = [];

    const seenChunkIds = new Set<string>();

    for (const source of question.sources) {
      const chunk = source.chunk;

      if (chunk.unit.document.status !== 'READY') {
        continue;
      }

      if (seenChunkIds.has(chunk.id)) {
        continue;
      }

      seenChunkIds.add(chunk.id);

      evidenceChunks.push({
        id: chunk.id,

        text: chunk.text,

        documentName: chunk.unit.document.originalName,

        unitLabel: chunk.unit.label,
      });
    }

    if (evidenceChunks.length === 0) {
      throw new BadRequestException(
        `Question ${questionId} has no READY ` +
          'evidence available for evaluation',
      );
    }

    /*
     * The AI call happens BEFORE any database
     * mutation.
     *
     * If evaluation fails, no QuestionAttempt
     * or AnswerEvaluation is created.
     */
    const evaluation = await this.evaluationAiClient.evaluateAnswer({
      questionId: question.id,

      conceptName: question.concept.name,

      questionType: question.type,

      difficulty: question.difficulty,

      prompt: question.prompt,

      expectedAnswer: question.expectedAnswer,

      evidenceChunks,

      answerText,
    });

    /*
     * Persist QuestionAttempt + AnswerEvaluation
     * atomically.
     */
    const persistedEvaluation = await this.persistEvaluation(
      studyPackId,
      conceptId,
      question,
      evidenceChunks,
      answerText,
      evaluation,
    );

    /*
     * Apply mastery AFTER the evaluation has been
     * safely persisted.
     *
     * Mastery processing is idempotent by
     * evaluationId, so an interrupted or failed
     * update can safely be repaired later.
     *
     * A mastery failure must NOT cause the already
     * valid learner evaluation to appear failed to
     * the client. Otherwise the client may retry
     * the answer submission and create an
     * unintended second attempt.
     */
    try {
      const mastery = await this.masteryService.applyEvaluation(
        persistedEvaluation.evaluationId,
      );

      return {
        ...persistedEvaluation,

        masteryStatus: mastery.applied ? 'APPLIED' : 'ALREADY_APPLIED',

        mastery,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        'Mastery update failed after ' +
          'successful answer evaluation. ' +
          `evaluationId=` +
          `${persistedEvaluation.evaluationId}. ` +
          `The evaluation remains persisted and ` +
          `can be repaired idempotently. ` +
          `Reason: ${message}`,
        stack,
      );

      return {
        ...persistedEvaluation,

        masteryStatus: 'PENDING',

        mastery: null,
      };
    }
  }

  private async persistEvaluation(
    studyPackId: string,
    conceptId: string,
    question: {
      id: string;

      type: 'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

      difficulty: 'EASY' | 'MEDIUM' | 'HARD';

      prompt: string;

      expectedAnswer: string;
    },
    evidenceChunks: EvaluationEvidenceChunk[],
    answerText: string,
    evaluation: AnswerEvaluationResult,
  ): Promise<PersistedEvaluationRecord> {
    const persisted = await this.prisma.$transaction(async (transaction) => {
      const attempt = await transaction.questionAttempt.create({
        data: {
          questionId: question.id,

          promptSnapshot: question.prompt,

          expectedAnswerSnapshot: question.expectedAnswer,

          questionTypeSnapshot: question.type,

          difficultySnapshot: question.difficulty,

          evidenceChunkIds: evidenceChunks.map((chunk) => chunk.id),

          answerText,
        },

        select: {
          id: true,
          createdAt: true,
        },
      });

      const storedEvaluation = await transaction.answerEvaluation.create({
        data: {
          attemptId: attempt.id,

          score: evaluation.score,

          correctness: evaluation.correctness,

          feedback: evaluation.feedback,

          missingPoints: evaluation.missingPoints,

          misconceptions: evaluation.misconceptions,

          evaluatorProvider: evaluation.evaluatorProvider,

          evaluatorModel: evaluation.evaluatorModel,

          evaluatorVersion: evaluation.evaluatorVersion,
        },

        select: {
          id: true,
        },
      });

      return {
        attemptId: attempt.id,

        evaluationId: storedEvaluation.id,

        createdAt: attempt.createdAt,
      };
    });

    return {
      studyPackId,

      conceptId,

      questionId: question.id,

      attemptId: persisted.attemptId,

      evaluationId: persisted.evaluationId,

      questionType: question.type,

      difficulty: question.difficulty,

      answerText,

      score: evaluation.score,

      correctness: evaluation.correctness,

      feedback: evaluation.feedback,

      missingPoints: evaluation.missingPoints,

      misconceptions: evaluation.misconceptions,

      evaluatorProvider: evaluation.evaluatorProvider,

      evaluatorModel: evaluation.evaluatorModel,

      evaluatorVersion: evaluation.evaluatorVersion,

      createdAt: persisted.createdAt,
    };
  }

  private validateAnswerText(rawAnswerText: unknown): string {
    if (typeof rawAnswerText !== 'string') {
      throw new BadRequestException('answerText must be a string');
    }

    const answerText = rawAnswerText.trim();

    if (!answerText) {
      throw new BadRequestException('answerText cannot be empty');
    }

    if (answerText.length > EvaluationsService.MAX_ANSWER_LENGTH) {
      throw new BadRequestException(
        `answerText cannot exceed ` +
          `${EvaluationsService.MAX_ANSWER_LENGTH} ` +
          'characters',
      );
    }

    return answerText;
  }
}
