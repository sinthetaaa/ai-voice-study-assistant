import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  PerformanceAnswerSummary,
  PerformanceConceptSummary,
  summarizePerformanceAnswers,
  summarizePerformanceConcepts,
} from './study-pack-performance';
import {
  PerformanceHierarchySummary,
  summarizePerformanceHierarchy,
} from './study-pack-performance-hierarchy';

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

export type StudyPackPerformanceSessionTrendPoint = {
  sessionId: string;

  sessionNumber: number | null;

  kind: 'NORMAL' | 'REVIEW';

  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

  startedAt: Date;

  completedAt: Date | null;

  answerQuality: PerformanceAnswerSummary;
};

export type StudyPackPerformanceHierarchy = PerformanceHierarchySummary & {
  status: 'DIRTY' | 'GENERATING' | 'READY' | 'FAILED';

  revision: number;

  generatedRevision: number | null;

  current: boolean;
};

export type StudyPackPerformanceResult = {
  studyPack: {
    id: string;

    name: string;
  };

  mastery: PerformanceConceptSummary;

  answerQuality: PerformanceAnswerSummary;

  sessionTrend: StudyPackPerformanceSessionTrendPoint[];

  hierarchy: StudyPackPerformanceHierarchy;

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

        hierarchyStatus: true,

        hierarchyRevision: true,

        hierarchyGeneratedRevision: true,

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
     * Hierarchy performance is based on the persisted
     * learner-facing Topic → Core Concept → Atomic
     * Concept structure.
     *
     * Only Atomic Concepts still backed by READY
     * material participate. This keeps hierarchy
     * performance aligned with the active-concept
     * definition used throughout StudyLoop.
     *
     * Hierarchy freshness/status is handled separately
     * by the Phase 8 stale-hierarchy read-model state.
     */
    const hierarchyTopics = await this.prisma.studyTopic.findMany({
      where: {
        studyPackId,
      },

      orderBy: [
        {
          position: 'asc',
        },
        {
          id: 'asc',
        },
      ],

      select: {
        id: true,

        name: true,

        position: true,

        coreConcepts: {
          orderBy: [
            {
              position: 'asc',
            },
            {
              id: 'asc',
            },
          ],

          select: {
            id: true,

            name: true,

            importance: true,

            position: true,

            atomicConcepts: {
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
                  positionInCore: 'asc',
                },
                {
                  id: 'asc',
                },
              ],

              select: {
                id: true,

                mastery: {
                  select: {
                    masteryScore: true,

                    evidenceWeight: true,

                    attemptCount: true,
                  },
                },
              },
            },
          },
        },
      },
    });

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

    /*
     * Session trend is based only on evaluated answers
     * that belong to a persisted StudySession.
     *
     * Sessions without evaluated answers remain part
     * of Normal-session numbering, but they do not
     * create meaningless empty chart points.
     */
    const sessions = await this.prisma.studySession.findMany({
      where: {
        studyPackId,
      },

      orderBy: [
        {
          startedAt: 'asc',
        },
        {
          id: 'asc',
        },
      ],

      select: {
        id: true,

        kind: true,

        status: true,

        startedAt: true,

        completedAt: true,

        attempts: {
          select: {
            evaluation: {
              select: {
                score: true,

                correctness: true,
              },
            },
          },
        },
      },
    });

    const mastery = summarizePerformanceConcepts(studyPack.concepts, now);

    const answerQuality = summarizePerformanceAnswers(evaluations);

    const hierarchySummary = summarizePerformanceHierarchy(hierarchyTopics);

    const hierarchy: StudyPackPerformanceHierarchy = {
      status: studyPack.hierarchyStatus,

      revision: studyPack.hierarchyRevision,

      generatedRevision: studyPack.hierarchyGeneratedRevision,

      current:
        studyPack.hierarchyStatus === 'READY' &&
        studyPack.hierarchyGeneratedRevision === studyPack.hierarchyRevision,

      ...hierarchySummary,
    };

    const sessionTrend: StudyPackPerformanceSessionTrendPoint[] = [];

    let normalSessionNumber = 0;

    for (const session of sessions) {
      const sessionNumber =
        session.kind === 'NORMAL' ? ++normalSessionNumber : null;

      const sessionEvaluations = session.attempts.flatMap((attempt) =>
        attempt.evaluation ? [attempt.evaluation] : [],
      );

      if (sessionEvaluations.length === 0) {
        continue;
      }

      sessionTrend.push({
        sessionId: session.id,

        sessionNumber,

        kind: session.kind,

        status: session.status,

        startedAt: session.startedAt,

        completedAt: session.completedAt,

        answerQuality: summarizePerformanceAnswers(sessionEvaluations),
      });
    }

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

      sessionTrend,

      hierarchy,

      concepts,
    };
  }
}
