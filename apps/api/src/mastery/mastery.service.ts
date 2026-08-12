import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

type MasteryQuestionType = 'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

export type MasteryApplicationResult = {
  applied: boolean;

  evaluationId: string;
  eventId: string;

  conceptId: string;
  conceptName: string;

  questionType: MasteryQuestionType;

  score: number;
  weight: number;

  event: {
    alphaBefore: number;
    betaBefore: number;

    alphaAfter: number;
    betaAfter: number;

    masteryBefore: number;
    masteryAfter: number;
  };

  mastery: {
    alpha: number;
    beta: number;

    masteryScore: number;

    evidenceWeight: number;
    attemptCount: number;
  };
};

@Injectable()
export class MasteryService {
  private static readonly INITIAL_ALPHA = 1.0;

  private static readonly INITIAL_BETA = 1.0;

  private static readonly QUESTION_WEIGHTS: Record<
    MasteryQuestionType,
    number
  > = {
    RECALL: 0.75,
    UNDERSTANDING: 1.0,
    APPLICATION: 1.25,
  };

  constructor(private readonly prisma: PrismaService) {}

  async applyEvaluation(
    evaluationId: string,
  ): Promise<MasteryApplicationResult> {
    return this.prisma.$transaction(async (transaction) => {
      /*
       * Load the immutable evaluation and
       * QuestionAttempt snapshot.
       *
       * We intentionally use
       * questionTypeSnapshot rather than the
       * current live Question.type.
       */
      const evaluation = await transaction.answerEvaluation.findUnique({
        where: {
          id: evaluationId,
        },

        select: {
          id: true,
          score: true,

          attempt: {
            select: {
              questionTypeSnapshot: true,

              question: {
                select: {
                  concept: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!evaluation) {
        throw new NotFoundException(
          `AnswerEvaluation ${evaluationId} ` + 'was not found',
        );
      }

      const concept = evaluation.attempt.question.concept;

      const questionType = evaluation.attempt.questionTypeSnapshot;

      const score = evaluation.score;

      if (!Number.isFinite(score) || score < 0 || score > 1) {
        throw new Error(
          `AnswerEvaluation ${evaluationId} ` +
            `contains invalid score ${score}`,
        );
      }

      const weight = this.getQuestionWeight(questionType);

      /*
       * Ensure a ConceptMastery row exists.
       *
       * The initial state represents the
       * Beta(1, 1) neutral prior.
       */
      await transaction.conceptMastery.upsert({
        where: {
          conceptId: concept.id,
        },

        update: {},

        create: {
          conceptId: concept.id,

          alpha: MasteryService.INITIAL_ALPHA,

          beta: MasteryService.INITIAL_BETA,

          masteryScore: 0.5,

          evidenceWeight: 0.0,

          attemptCount: 0,
        },

        select: {
          id: true,
        },
      });

      /*
       * Lock this concept's mastery row for the
       * remainder of the transaction.
       *
       * This prevents two simultaneous learner
       * evaluations for the same concept from
       * reading the same old mastery state and
       * overwriting one another.
       */
      await transaction.$queryRaw`
          SELECT "id"
          FROM "ConceptMastery"
          WHERE "conceptId" = ${concept.id}
          FOR UPDATE
        `;

      /*
       * Check idempotency AFTER acquiring the
       * concept lock.
       *
       * If two requests attempt to process the
       * same evaluation concurrently, the second
       * request waits for the first transaction
       * and then observes the MasteryEvent.
       */
      const existingEvent = await transaction.masteryEvent.findUnique({
        where: {
          evaluationId: evaluation.id,
        },

        select: {
          id: true,

          score: true,
          weight: true,

          alphaBefore: true,
          betaBefore: true,

          alphaAfter: true,
          betaAfter: true,

          masteryBefore: true,

          masteryAfter: true,
        },
      });

      const currentMastery = await transaction.conceptMastery.findUniqueOrThrow(
        {
          where: {
            conceptId: concept.id,
          },

          select: {
            alpha: true,
            beta: true,

            masteryScore: true,

            evidenceWeight: true,

            attemptCount: true,
          },
        },
      );

      if (existingEvent) {
        return {
          applied: false,

          evaluationId: evaluation.id,

          eventId: existingEvent.id,

          conceptId: concept.id,

          conceptName: concept.name,

          questionType,

          score: existingEvent.score,

          weight: existingEvent.weight,

          event: {
            alphaBefore: existingEvent.alphaBefore,

            betaBefore: existingEvent.betaBefore,

            alphaAfter: existingEvent.alphaAfter,

            betaAfter: existingEvent.betaAfter,

            masteryBefore: existingEvent.masteryBefore,

            masteryAfter: existingEvent.masteryAfter,
          },

          mastery: {
            alpha: currentMastery.alpha,

            beta: currentMastery.beta,

            masteryScore: currentMastery.masteryScore,

            evidenceWeight: currentMastery.evidenceWeight,

            attemptCount: currentMastery.attemptCount,
          },
        };
      }

      const alphaBefore = currentMastery.alpha;

      const betaBefore = currentMastery.beta;

      const masteryBefore = this.calculateMastery(alphaBefore, betaBefore);

      /*
       * Fractional Beta update:
       *
       * alpha += weight * score
       * beta  += weight * (1 - score)
       */
      const alphaAfter = alphaBefore + weight * score;

      const betaAfter = betaBefore + weight * (1 - score);

      const masteryAfter = this.calculateMastery(alphaAfter, betaAfter);

      const evidenceWeightAfter = currentMastery.evidenceWeight + weight;

      const attemptCountAfter = currentMastery.attemptCount + 1;

      const updatedMastery = await transaction.conceptMastery.update({
        where: {
          conceptId: concept.id,
        },

        data: {
          alpha: alphaAfter,

          beta: betaAfter,

          masteryScore: masteryAfter,

          evidenceWeight: evidenceWeightAfter,

          attemptCount: attemptCountAfter,
        },

        select: {
          alpha: true,
          beta: true,

          masteryScore: true,

          evidenceWeight: true,

          attemptCount: true,
        },
      });

      const event = await transaction.masteryEvent.create({
        data: {
          conceptId: concept.id,

          evaluationId: evaluation.id,

          score,

          weight,

          alphaBefore,

          betaBefore,

          alphaAfter,

          betaAfter,

          masteryBefore,

          masteryAfter,
        },

        select: {
          id: true,
        },
      });

      return {
        applied: true,

        evaluationId: evaluation.id,

        eventId: event.id,

        conceptId: concept.id,

        conceptName: concept.name,

        questionType,

        score,

        weight,

        event: {
          alphaBefore,

          betaBefore,

          alphaAfter,

          betaAfter,

          masteryBefore,

          masteryAfter,
        },

        mastery: {
          alpha: updatedMastery.alpha,

          beta: updatedMastery.beta,

          masteryScore: updatedMastery.masteryScore,

          evidenceWeight: updatedMastery.evidenceWeight,

          attemptCount: updatedMastery.attemptCount,
        },
      };
    });
  }

  async getConceptMastery(studyPackId: string, conceptId: string) {
    const concept = await this.prisma.concept.findFirst({
      where: {
        id: conceptId,

        studyPackId,
      },

      select: {
        id: true,
        name: true,

        mastery: {
          select: {
            alpha: true,
            beta: true,

            masteryScore: true,

            evidenceWeight: true,

            attemptCount: true,

            createdAt: true,

            updatedAt: true,
          },
        },
      },
    });

    if (!concept) {
      throw new NotFoundException(
        `Concept ${conceptId} was not found ` + `in Study Pack ${studyPackId}`,
      );
    }

    /*
     * No persisted ConceptMastery yet means the
     * learner is still at the neutral prior.
     */
    if (!concept.mastery) {
      return {
        studyPackId,

        conceptId: concept.id,

        conceptName: concept.name,

        alpha: MasteryService.INITIAL_ALPHA,

        beta: MasteryService.INITIAL_BETA,

        masteryScore: 0.5,

        evidenceWeight: 0.0,

        attemptCount: 0,

        initialized: false,
      };
    }

    return {
      studyPackId,

      conceptId: concept.id,

      conceptName: concept.name,

      alpha: concept.mastery.alpha,

      beta: concept.mastery.beta,

      masteryScore: concept.mastery.masteryScore,

      evidenceWeight: concept.mastery.evidenceWeight,

      attemptCount: concept.mastery.attemptCount,

      initialized: true,

      createdAt: concept.mastery.createdAt,

      updatedAt: concept.mastery.updatedAt,
    };
  }

  private getQuestionWeight(questionType: MasteryQuestionType): number {
    return MasteryService.QUESTION_WEIGHTS[questionType];
  }

  private calculateMastery(alpha: number, beta: number): number {
    const denominator = alpha + beta;

    if (!Number.isFinite(denominator) || denominator <= 0) {
      throw new Error('Invalid mastery distribution state');
    }

    return alpha / denominator;
  }
}
