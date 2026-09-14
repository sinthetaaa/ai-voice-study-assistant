/* eslint-disable @typescript-eslint/no-require-imports */

import type { PrismaService } from '../prisma/prisma.service';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { StudyPackPerformanceService } =
  require('./study-pack-performance.service') as typeof import('./study-pack-performance.service');

describe('StudyPackPerformanceService', () => {
  const now = new Date('2026-09-14T12:00:00.000Z');

  it('returns lifetime mastery and historical answer quality', async () => {
    const prisma = {
      studyPack: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pack-1',

          name: 'Operating Systems',

          concepts: [
            {
              id: 'concept-1',

              name: 'Processes',

              importance: 5,

              difficulty: 'FOUNDATIONAL',

              mastery: {
                masteryScore: 0.8,

                evidenceWeight: 3,

                attemptCount: 3,

                reviewDueAt: new Date('2026-09-13T12:00:00.000Z'),

                lastReviewedAt: null,
              },
            },

            {
              id: 'concept-2',

              name: 'Virtual Memory',

              importance: 4,

              difficulty: 'INTERMEDIATE',

              mastery: {
                masteryScore: 0.6,

                evidenceWeight: 2,

                attemptCount: 2,

                reviewDueAt: new Date('2026-09-20T12:00:00.000Z'),

                lastReviewedAt: new Date('2026-09-10T12:00:00.000Z'),
              },
            },

            {
              id: 'concept-3',

              name: 'Deadlock',

              importance: 5,

              difficulty: 'ADVANCED',

              mastery: {
                masteryScore: 0.5,

                evidenceWeight: 0,

                attemptCount: 0,

                reviewDueAt: null,

                lastReviewedAt: null,
              },
            },
          ],
        }),
      },

      studyTopic: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'topic-os',

            name: 'Operating Systems',

            position: 0,

            coreConcepts: [
              {
                id: 'core-process',

                name: 'Process Management',

                importance: 5,

                position: 0,

                atomicConcepts: [
                  {
                    id: 'concept-1',

                    mastery: {
                      masteryScore: 0.8,

                      evidenceWeight: 3,

                      attemptCount: 3,
                    },
                  },

                  {
                    id: 'concept-3',

                    mastery: {
                      masteryScore: 0.5,

                      evidenceWeight: 0,

                      attemptCount: 0,
                    },
                  },
                ],
              },

              {
                id: 'core-memory',

                name: 'Memory Management',

                importance: 4,

                position: 1,

                atomicConcepts: [
                  {
                    id: 'concept-2',

                    mastery: {
                      masteryScore: 0.6,

                      evidenceWeight: 2,

                      attemptCount: 2,
                    },
                  },
                ],
              },
            ],
          },
        ]),
      },

      answerEvaluation: {
        findMany: jest.fn().mockResolvedValue([
          {
            score: 1,

            correctness: 'CORRECT',
          },

          {
            score: 0.6,

            correctness: 'PARTIAL',
          },

          {
            score: 0.2,

            correctness: 'INCORRECT',
          },

          {
            score: 0.8,

            correctness: 'CORRECT',
          },
        ]),
      },

      studySession: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'normal-1',

            kind: 'NORMAL',

            status: 'COMPLETED',

            startedAt: new Date('2026-09-01T10:00:00.000Z'),

            completedAt: new Date('2026-09-01T10:05:00.000Z'),

            attempts: [
              {
                evaluation: null,
              },
            ],
          },

          {
            id: 'normal-2',

            kind: 'NORMAL',

            status: 'ABANDONED',

            startedAt: new Date('2026-09-05T10:00:00.000Z'),

            completedAt: null,

            attempts: [
              {
                evaluation: {
                  score: 1,

                  correctness: 'CORRECT',
                },
              },

              {
                evaluation: {
                  score: 0.6,

                  correctness: 'PARTIAL',
                },
              },
            ],
          },

          {
            id: 'review-1',

            kind: 'REVIEW',

            status: 'COMPLETED',

            startedAt: new Date('2026-09-10T10:00:00.000Z'),

            completedAt: new Date('2026-09-10T10:05:00.000Z'),

            attempts: [
              {
                evaluation: {
                  score: 0.2,

                  correctness: 'INCORRECT',
                },
              },
            ],
          },
        ]),
      },
    };

    const service = new StudyPackPerformanceService(
      prisma as unknown as PrismaService,
    );

    const result = await service.findOne('pack-1', 'user-1', now);

    expect(prisma.studyPack.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'pack-1',

        ownerId: 'user-1',
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

    expect(prisma.studyTopic.findMany).toHaveBeenCalledWith({
      where: {
        studyPackId: 'pack-1',
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

    expect(prisma.answerEvaluation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          attempt: {
            question: {
              concept: {
                studyPackId: 'pack-1',
              },
            },
          },
        },
      }),
    );

    expect(prisma.studySession.findMany).toHaveBeenCalledWith({
      where: {
        studyPackId: 'pack-1',
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

    expect(result.mastery).toEqual({
      activeConceptCount: 3,

      evaluatedConceptCount: 2,

      unevaluatedConceptCount: 1,

      averageMastery: 0.7,

      totalMasteryAttempts: 5,

      totalEvidenceWeight: 5,

      scheduledReviewCount: 2,

      dueReviewCount: 1,
    });

    expect(result.answerQuality).toEqual({
      evaluatedAnswerCount: 4,

      averageScore: 0.65,

      correctness: {
        correct: 2,

        partial: 1,

        incorrect: 1,
      },
    });

    expect(result.sessionTrend).toEqual([
      {
        sessionId: 'normal-2',

        sessionNumber: 2,

        kind: 'NORMAL',

        status: 'ABANDONED',

        startedAt: new Date('2026-09-05T10:00:00.000Z'),

        completedAt: null,

        answerQuality: {
          evaluatedAnswerCount: 2,

          averageScore: 0.8,

          correctness: {
            correct: 1,

            partial: 1,

            incorrect: 0,
          },
        },
      },

      {
        sessionId: 'review-1',

        sessionNumber: null,

        kind: 'REVIEW',

        status: 'COMPLETED',

        startedAt: new Date('2026-09-10T10:00:00.000Z'),

        completedAt: new Date('2026-09-10T10:05:00.000Z'),

        answerQuality: {
          evaluatedAnswerCount: 1,

          averageScore: 0.2,

          correctness: {
            correct: 0,

            partial: 0,

            incorrect: 1,
          },
        },
      },
    ]);

    expect(result.hierarchy.topics).toEqual([
      {
        id: 'topic-os',

        name: 'Operating Systems',

        position: 0,

        coreConceptCount: 2,

        evaluatedCoreConceptCount: 2,

        unevaluatedCoreConceptCount: 0,

        atomicConceptCount: 3,

        evaluatedAtomicConceptCount: 2,

        averageMastery: 0.7,
      },
    ]);

    expect(result.hierarchy.coreConcepts).toEqual([
      {
        id: 'core-process',

        name: 'Process Management',

        topicId: 'topic-os',

        topicName: 'Operating Systems',

        topicPosition: 0,

        importance: 5,

        position: 0,

        atomicConceptCount: 2,

        evaluatedAtomicConceptCount: 1,

        unevaluatedAtomicConceptCount: 1,

        averageMastery: 0.8,

        totalAttemptCount: 3,

        totalEvidenceWeight: 3,
      },

      {
        id: 'core-memory',

        name: 'Memory Management',

        topicId: 'topic-os',

        topicName: 'Operating Systems',

        topicPosition: 0,

        importance: 4,

        position: 1,

        atomicConceptCount: 1,

        evaluatedAtomicConceptCount: 1,

        unevaluatedAtomicConceptCount: 0,

        averageMastery: 0.6,

        totalAttemptCount: 2,

        totalEvidenceWeight: 2,
      },
    ]);

    expect(result.hierarchy.strongestCoreConcept).toEqual({
      id: 'core-process',

      name: 'Process Management',

      topicId: 'topic-os',

      topicName: 'Operating Systems',

      averageMastery: 0.8,

      evaluatedAtomicConceptCount: 1,

      atomicConceptCount: 2,
    });

    expect(result.hierarchy.weakestCoreConcept).toEqual({
      id: 'core-memory',

      name: 'Memory Management',

      topicId: 'topic-os',

      topicName: 'Operating Systems',

      averageMastery: 0.6,

      evaluatedAtomicConceptCount: 1,

      atomicConceptCount: 1,
    });

    expect(result.concepts).toEqual([
      {
        id: 'concept-1',

        name: 'Processes',

        importance: 5,

        difficulty: 'FOUNDATIONAL',

        mastery: {
          score: 0.8,

          evidenceWeight: 3,

          attemptCount: 3,

          reviewDueAt: new Date('2026-09-13T12:00:00.000Z'),

          lastReviewedAt: null,

          dueForReview: true,
        },
      },

      {
        id: 'concept-2',

        name: 'Virtual Memory',

        importance: 4,

        difficulty: 'INTERMEDIATE',

        mastery: {
          score: 0.6,

          evidenceWeight: 2,

          attemptCount: 2,

          reviewDueAt: new Date('2026-09-20T12:00:00.000Z'),

          lastReviewedAt: new Date('2026-09-10T12:00:00.000Z'),

          dueForReview: false,
        },
      },

      {
        id: 'concept-3',

        name: 'Deadlock',

        importance: 5,

        difficulty: 'ADVANCED',

        mastery: null,
      },
    ]);
  });

  it('returns clean empty performance before learning begins', async () => {
    const prisma = {
      studyPack: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pack-2',

          name: 'Databases',

          concepts: [],
        }),
      },

      studyTopic: {
        findMany: jest.fn().mockResolvedValue([]),
      },

      answerEvaluation: {
        findMany: jest.fn().mockResolvedValue([]),
      },

      studySession: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const service = new StudyPackPerformanceService(
      prisma as unknown as PrismaService,
    );

    const result = await service.findOne('pack-2', 'user-1', now);

    expect(result.mastery).toEqual({
      activeConceptCount: 0,

      evaluatedConceptCount: 0,

      unevaluatedConceptCount: 0,

      averageMastery: null,

      totalMasteryAttempts: 0,

      totalEvidenceWeight: 0,

      scheduledReviewCount: 0,

      dueReviewCount: 0,
    });

    expect(result.answerQuality).toEqual({
      evaluatedAnswerCount: 0,

      averageScore: null,

      correctness: {
        correct: 0,

        partial: 0,

        incorrect: 0,
      },
    });

    expect(result.sessionTrend).toEqual([]);

    expect(result.hierarchy).toEqual({
      topics: [],

      coreConcepts: [],

      strongestCoreConcept: null,

      weakestCoreConcept: null,
    });

    expect(result.concepts).toEqual([]);
  });

  it('rejects a Study Pack outside the owner scope', async () => {
    const prisma = {
      studyPack: {
        findFirst: jest.fn().mockResolvedValue(null),
      },

      studyTopic: {
        findMany: jest.fn(),
      },

      answerEvaluation: {
        findMany: jest.fn(),
      },

      studySession: {
        findMany: jest.fn(),
      },
    };

    const service = new StudyPackPerformanceService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.findOne('pack-foreign', 'user-1', now),
    ).rejects.toThrow('Study Pack pack-foreign was not found');

    expect(prisma.studyTopic.findMany).not.toHaveBeenCalled();

    expect(prisma.answerEvaluation.findMany).not.toHaveBeenCalled();

    expect(prisma.studySession.findMany).not.toHaveBeenCalled();
  });
});
