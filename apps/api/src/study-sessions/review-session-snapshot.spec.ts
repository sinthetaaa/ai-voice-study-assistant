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

const { StudySessionsService } = require('./study-sessions.service');

describe('StudySessionsService review concept snapshots', () => {
  it('persists concept metadata when a REVIEW session starts', async () => {
    const tx = {
      studySession: {
        create: jest.fn().mockResolvedValue({
          id: 'review-session-1',
        }),
      },
      sessionConceptProgress: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      studyPack: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pack-1',
        }),
      },

      studySession: {
        findFirst: jest.fn().mockResolvedValue(null),
      },

      concept: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'concept-1',
            name: 'Binary Trees',
            difficulty: 'INTERMEDIATE',
            importance: 4,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            mastery: {
              reviewDueAt: new Date('2026-01-02T00:00:00.000Z'),
              reviewQuestionType: 'UNDERSTANDING',
              reviewIntervalDays: 1,
            },
          },
        ]),
      },

      $transaction: jest
        .fn()
        .mockImplementation(async (callback: any) => callback(tx)),
    };

    const service = new StudySessionsService(prisma, {}, {}, {});

    jest.spyOn(service as any, 'ensureConceptQuestionSet').mockResolvedValue([
      {
        id: 'question-1',
        type: 'UNDERSTANDING',
        difficulty: 'MEDIUM',
        prompt: 'Explain binary trees.',
      },
    ]);

    jest.spyOn(service, 'getSessionState').mockResolvedValue({} as any);

    await service.startReviewSession('pack-1');

    expect(prisma.concept.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          id: true,
          name: true,
          importance: true,
          difficulty: true,
          createdAt: true,
        }),
      }),
    );

    expect(tx.sessionConceptProgress.create).toHaveBeenCalledTimes(1);

    expect(tx.sessionConceptProgress.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'review-session-1',
        conceptId: 'concept-1',

        conceptNameSnapshot: 'Binary Trees',

        conceptDifficultySnapshot: 'INTERMEDIATE',

        conceptImportanceSnapshot: 4,

        position: 0,
        status: 'IN_PROGRESS',
        reviewRequired: false,
      }),
    });
  });
});
