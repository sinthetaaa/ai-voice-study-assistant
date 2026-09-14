import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  PerformanceAnswerSummary,
  PerformanceConceptSummary,
  summarizePerformanceAnswers,
  summarizePerformanceConcepts,
} from './study-pack-performance';

export type StudyPackPerformanceConcept = {
  id: string;

  name: string;

  importance: number;

  difficulty: 'FOUNDATIONAL' | 'INTERMEDIATE' | 'ADVANCED';

  mastery: {
    score: number;

    evidenceWeight: number;

    attemptCount: number;

    reviewDueAt: Date | null;

    lastReviewedAt: Date | null;

    dueForReview: boolean;
  } | null;
};

export type StudyPackPerformanceResult = {
  studyPack: {
    id: string;

    name: string;
  };

  mastery: PerformanceConceptSummary;

  answerQuality: PerformanceAnswerSummary;

  concepts: StudyPackPerformanceConcept[];
};

@Injectable()
export class StudyPackPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(
    studyPackId: string,
    ownerId: string,
    now = new Date(),
  ): Promise<StudyPackPerformanceResult> {
    const studyPack = await this.prisma.studyPack.findFirst({
      where: {
        id: studyPackId,

        ownerId,
      },

      select: {
        id: true,

        name: true,

        concepts: {
          where: {
            sources: {
              some: {
                chunk: {
                  unit: {
                    document: {
                      status: 'READY',
                    },
                  },
                },
              },
            },
          },

          orderBy: [
            {
              createdAt: 'asc',
            },
            {
              id: 'asc',
            },
          ],

          select: {
            id: true,

            name: true,

            importance: true,

            difficulty: true,

            mastery: {
              select: {
                masteryScore: true,

                evidenceWeight: true,

                attemptCount: true,

                reviewDueAt: true,

                lastReviewedAt: true,
              },
            },
          },
        },
      },
    });

    if (!studyPack) {
      throw new NotFoundException(`Study Pack ${studyPackId} was not found`);
    }

    /*
     * Answer quality is historical learner evidence.
     *
     * It intentionally does NOT use the active-concept
     * provenance filter above. A valid persisted answer
     * remains part of the learner's performance history
     * even if Study Pack material later changes.
     */
    const evaluations = await this.prisma.answerEvaluation.findMany({
      where: {
        attempt: {
          question: {
            concept: {
              studyPackId,
            },
          },
        },
      },

      orderBy: [
        {
          createdAt: 'asc',
        },
        {
          id: 'asc',
        },
      ],

      select: {
        score: true,

        correctness: true,
      },
    });

    const mastery = summarizePerformanceConcepts(studyPack.concepts, now);

    const answerQuality = summarizePerformanceAnswers(evaluations);

    const concepts: StudyPackPerformanceConcept[] = studyPack.concepts.map(
      (concept) => {
        /*
         * ConceptMastery may physically exist with the
         * neutral Beta prior but zero learner attempts.
         *
         * That is not demonstrated learner mastery.
         * Normalize it to null at the read-model boundary
         * so frontend consumers cannot accidentally render
         * the neutral 0.5 prior as "50% learned".
         */
        if (!concept.mastery || concept.mastery.attemptCount === 0) {
          return {
            id: concept.id,

            name: concept.name,

            importance: concept.importance,

            difficulty: concept.difficulty,

            mastery: null,
          };
        }

        const reviewDueAt = concept.mastery.reviewDueAt;

        return {
          id: concept.id,

          name: concept.name,

          importance: concept.importance,

          difficulty: concept.difficulty,

          mastery: {
            score: concept.mastery.masteryScore,

            evidenceWeight: concept.mastery.evidenceWeight,

            attemptCount: concept.mastery.attemptCount,

            reviewDueAt,

            lastReviewedAt: concept.mastery.lastReviewedAt,

            dueForReview:
              reviewDueAt !== null && reviewDueAt.getTime() <= now.getTime(),
          },
        };
      },
    );

    return {
      studyPack: {
        id: studyPack.id,

        name: studyPack.name,
      },

      mastery,

      answerQuality,

      concepts,
    };
  }
}
