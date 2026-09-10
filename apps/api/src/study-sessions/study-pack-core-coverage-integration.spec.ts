jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../questions/questions.service', () => ({
  QuestionsService: class QuestionsService {},
}));

jest.mock('../evaluations/evaluations.service', () => ({
  EvaluationsService: class EvaluationsService {},
}));

jest.mock('../learning-loop/learning-loop.service', () => ({
  LearningLoopService: class LearningLoopService {},
}));

import { NotFoundException } from '@nestjs/common';

import { StudySessionsService } from './study-sessions.service';

function createHarness() {
  const prisma = {
    studyPack: {
      findUnique: jest.fn(),
    },

    questionAttempt: {
      findMany: jest.fn(),
    },
  };

  const service = new StudySessionsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return {
    service,
    prisma,
  };
}

function authoritativeStudyPack() {
  return {
    id: 'pack-1',

    hierarchyStatus: 'READY',
    hierarchyRevision: 7,
    hierarchyGeneratedRevision: 7,

    topics: [
      {
        id: 'topic-1',
        name: 'Learning Foundations',
        description: 'Foundational learning concepts.',
        position: 0,

        coreConcepts: [
          {
            id: 'core-a',
            name: 'Value Learning',
            description: 'Learn action values.',
            importance: 5,
            position: 0,

            atomicConcepts: [
              {
                id: 'a-1',
                name: 'Q Values',
                importance: 5,
                difficulty: 'FOUNDATIONAL',
                positionInCore: 0,
              },

              {
                id: 'a-2',
                name: 'Bellman Update',
                importance: 4,
                difficulty: 'INTERMEDIATE',
                positionInCore: 1,
              },
            ],
          },

          {
            id: 'core-b',
            name: 'Exploration',
            description: 'Explore uncertain actions.',
            importance: 1,
            position: 1,

            atomicConcepts: [
              {
                id: 'b-1',
                name: 'Epsilon Greedy',
                importance: 3,
                difficulty: 'FOUNDATIONAL',
                positionInCore: 0,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('Study Pack Core Concept coverage integration', () => {
  it('builds learner-facing coverage from evaluated NORMAL attempts', async () => {
    const { service, prisma } = createHarness();

    prisma.studyPack.findUnique.mockResolvedValue(authoritativeStudyPack());

    /*
     * a-1 has exposure,
     * a-2 has no exposure,
     * b-1 has exposure.
     *
     * Therefore:
     *
     * core-a = 1/2 = IN_PROGRESS
     * core-b = 1/1 = COVERED
     */
    prisma.questionAttempt.findMany.mockResolvedValue([
      {
        question: {
          conceptId: 'a-1',
        },
      },

      {
        question: {
          conceptId: 'b-1',
        },
      },

      {
        question: {
          conceptId: 'b-1',
        },
      },
    ]);

    const result = await service.getStudyPackCoverage('pack-1');

    expect(result.hierarchy).toEqual({
      status: 'READY',
      revision: 7,
      generatedRevision: 7,
      authoritative: true,
    });

    expect(result.totalCoreConceptCount).toBe(2);

    expect(result.coveredCoreConceptCount).toBe(1);

    expect(result.inProgressCoreConceptCount).toBe(1);

    expect(result.untouchedCoreConceptCount).toBe(0);

    expect(result.totalAtomicConceptCount).toBe(3);

    expect(result.testedAtomicConceptCount).toBe(2);

    expect(result.untestedAtomicConceptCount).toBe(1);

    /*
     * Unweighted Core Concept coverage:
     *
     * (0.5 + 1.0) / 2 = 0.75
     */
    expect(result.ratio).toBeCloseTo(0.75);

    /*
     * Importance weighted:
     *
     * (5*0.5 + 1*1) / 6
     * = 3.5 / 6
     */
    expect(result.weightedRatio).toBeCloseTo(3.5 / 6);

    expect(result.percentage).toBe(58);

    expect(result.topics[0].coreConcepts[0].coverage.state).toBe('IN_PROGRESS');

    expect(result.topics[0].coreConcepts[1].coverage.state).toBe('COVERED');

    expect(
      result.topics[0].coreConcepts[0].atomicConcepts.map((concept) => ({
        id: concept.id,
        tested: concept.tested,
      })),
    ).toEqual([
      {
        id: 'a-1',
        tested: true,
      },
      {
        id: 'a-2',
        tested: false,
      },
    ]);

    /*
     * Temporary compatibility aliases now use
     * Core Concepts.
     */
    expect(result.totalConceptCount).toBe(2);

    expect(result.testedConceptCount).toBe(2);

    expect(result.untestedConceptCount).toBe(0);

    const attemptQuery = prisma.questionAttempt.findMany.mock.calls[0][0];

    expect(attemptQuery.where.studySession).toEqual({
      studyPackId: 'pack-1',
      kind: 'NORMAL',
    });

    expect(attemptQuery.where.evaluation).toEqual({
      isNot: null,
    });

    expect(attemptQuery.where.question.conceptId.in).toEqual([
      'a-1',
      'a-2',
      'b-1',
    ]);
  });

  it('does not expose stale hierarchy coverage while regeneration is pending', async () => {
    const { service, prisma } = createHarness();

    const studyPack = authoritativeStudyPack();

    prisma.studyPack.findUnique.mockResolvedValue({
      ...studyPack,

      hierarchyStatus: 'DIRTY',

      hierarchyRevision: 8,

      hierarchyGeneratedRevision: 7,
    });

    const result = await service.getStudyPackCoverage('pack-1');

    expect(result.hierarchy).toEqual({
      status: 'DIRTY',
      revision: 8,
      generatedRevision: 7,
      authoritative: false,
    });

    expect(result.totalCoreConceptCount).toBe(0);

    expect(result.percentage).toBe(0);

    expect(result.topics).toEqual([]);

    expect(prisma.questionAttempt.findMany).not.toHaveBeenCalled();
  });

  it('treats a READY hierarchy with the wrong revision as stale', async () => {
    const { service, prisma } = createHarness();

    const studyPack = authoritativeStudyPack();

    prisma.studyPack.findUnique.mockResolvedValue({
      ...studyPack,

      hierarchyStatus: 'READY',

      hierarchyRevision: 9,

      hierarchyGeneratedRevision: 8,
    });

    const result = await service.getStudyPackCoverage('pack-1');

    expect(result.hierarchy.authoritative).toBe(false);

    expect(result.topics).toEqual([]);

    expect(prisma.questionAttempt.findMany).not.toHaveBeenCalled();
  });

  it('throws when the Study Pack does not exist', async () => {
    const { service, prisma } = createHarness();

    prisma.studyPack.findUnique.mockResolvedValue(null);

    await expect(
      service.getStudyPackCoverage('missing-pack'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.questionAttempt.findMany).not.toHaveBeenCalled();
  });
});
