import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  AnswerEvaluationResult,
  EvaluationAiClientService,
  EvaluationEvidenceChunk,
} from './evaluation-ai-client.service';

export type PersistedEvaluationResult = {
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

@Injectable()
export class EvaluationsService {
  private static readonly MAX_ANSWER_LENGTH = 12_000;

  constructor(
    private readonly prisma: PrismaService,

    private readonly evaluationAiClient: EvaluationAiClientService,
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
     * These values become the immutable attempt
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
     * The AI call happens before database mutation.
     *
     * If evaluation fails, no partial
     * QuestionAttempt is persisted.
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

    return this.persistEvaluation(
      studyPackId,
      conceptId,
      question,
      evidenceChunks,
      answerText,
      evaluation,
    );
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
  ): Promise<PersistedEvaluationResult> {
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
