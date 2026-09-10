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

const {
  StudySessionsService,
} = require('./study-sessions.service');

function makeConcept(index: number) {
  return {
    id: `concept-${index}`,
    name: `Concept ${index}`,
    importance: 3,
    difficulty: 'INTERMEDIATE',
    createdAt: new Date(
      `2026-01-${String(index).padStart(2, '0')}T00:00:00Z`,
    ),
    mastery: null,
  };
}

describe('StudySessionsService lazy question preparation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prepares only the first concept when a normal session starts', async () => {
    const concepts = [
      makeConcept(1),
      makeConcept(2),
      makeConcept(3),
      makeConcept(4),
      makeConcept(5),
    ];

    const tx = {
      studySession: {
        create: jest.fn().mockResolvedValue({
          id: 'session-1',
          startedAt: new Date(
            '2026-09-11T00:00:00.000Z',
          ),
        }),
      },

      sessionConceptProgress: {
        createMany: jest.fn().mockResolvedValue({
          count: 5,
        }),

        update: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      studyPack: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pack-1',
        }),
      },

      concept: {
        findMany: jest.fn().mockResolvedValue(
          concepts,
        ),
      },

      questionAttempt: {
        findMany: jest.fn().mockResolvedValue([]),
      },

      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: any) => callback(tx),
        ),
    };

    const service = new StudySessionsService(
      prisma,
      {},
      {},
      {},
    );

    /*
     * Keep first-concept randomization deterministic.
     */
    jest
      .spyOn(Math, 'random')
      .mockReturnValue(0);

    const ensureConceptQuestionSet = jest
      .spyOn(
        service as any,
        'ensureConceptQuestionSet',
      )
      .mockResolvedValue([
        {
          id: 'recall-1',
          type: 'RECALL',
          difficulty: 'EASY',
          prompt: 'Recall question',
        },
        {
          id: 'understanding-1',
          type: 'UNDERSTANDING',
          difficulty: 'MEDIUM',
          prompt: 'Understanding question',
        },
        {
          id: 'application-1',
          type: 'APPLICATION',
          difficulty: 'HARD',
          prompt: 'Application question',
        },
      ]);

    jest
      .spyOn(service, 'getSessionState')
      .mockResolvedValue({
        sessionId: 'session-1',
        studyPackId: 'pack-1',
        kind: 'NORMAL',
        status: 'ACTIVE',
        startedAt: new Date(),
        completedAt: null,
        sessionNumber: 1,
        conceptCount: 5,
        progress: {
          completedConceptCount: 0,
          reviewRequiredCount: 0,
          remainingConceptCount: 5,
        },
        currentConcept: {
          id: 'concept-1',
          name: 'Concept 1',
          difficulty: 'INTERMEDIATE',
          importance: 3,
          position: 0,
          status: 'IN_PROGRESS',
          reviewRequired: false,
          recoveryTargetQuestionType: null,
          mastery: {
            score: 0,
            evidenceWeight: 0,
            attemptCount: 0,
          },
        },
        currentQuestion: {
          id: 'recall-1',
          type: 'RECALL',
          difficulty: 'EASY',
          prompt: 'Recall question',
        },
        conceptFlow: [],
      });

    await service.startSession('pack-1');

    /*
     * Critical startup regression:
     *
     * five selected concepts must NOT mean five sequential
     * question-generation calls before Question 1 appears.
     */
    expect(
      ensureConceptQuestionSet,
    ).toHaveBeenCalledTimes(1);

    expect(
      ensureConceptQuestionSet,
    ).toHaveBeenCalledWith(
      'pack-1',
      'concept-1',
    );

    /*
     * The learning plan itself must still contain all five
     * concepts even though only the first is prepared.
     */
    expect(
      tx.sessionConceptProgress.createMany,
    ).toHaveBeenCalledTimes(1);

    const createManyArgument =
      tx.sessionConceptProgress.createMany.mock
        .calls[0][0];

    expect(
      createManyArgument.data,
    ).toHaveLength(5);

    expect(
      createManyArgument.data.map(
        (item: any) => item.conceptId,
      ),
    ).toEqual([
      'concept-1',
      'concept-2',
      'concept-3',
      'concept-4',
      'concept-5',
    ]);
  });

  it('lazy-prepares the next pending concept before switching to it', async () => {
    const transactionStarted =
      jest.fn();

    const tx = {
      sessionConceptProgress: {
        update: jest.fn().mockResolvedValue({}),

        findFirst: jest.fn().mockResolvedValue({
          conceptId: 'concept-2',
        }),
      },

      conceptMastery: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'mastery-1',
        }),

        update: jest.fn().mockResolvedValue({}),
      },

      question: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'recall-2',
        }),
      },

      studySession: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      studySession: {
        findUnique: jest.fn().mockResolvedValue({
          studyPackId: 'pack-1',
          status: 'ACTIVE',
        }),
      },

      sessionConceptProgress: {
        findFirst: jest.fn().mockResolvedValue({
          conceptId: 'concept-2',
        }),
      },

      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: any) => {
            transactionStarted();
            return callback(tx);
          },
        ),
    };

    const service = new StudySessionsService(
      prisma,
      {},
      {},
      {},
    );

    const ensureConceptQuestionSet = jest
      .spyOn(
        service as any,
        'ensureConceptQuestionSet',
      )
      .mockResolvedValue([
        {
          id: 'recall-2',
          type: 'RECALL',
          difficulty: 'EASY',
          prompt: 'Recall question 2',
        },
        {
          id: 'understanding-2',
          type: 'UNDERSTANDING',
          difficulty: 'MEDIUM',
          prompt: 'Understanding question 2',
        },
        {
          id: 'application-2',
          type: 'APPLICATION',
          difficulty: 'HARD',
          prompt: 'Application question 2',
        },
      ]);

    await (service as any).advanceConcept(
      'session-1',
      'concept-1',
      'ADVANCE_CONCEPT',
      null,
    );

    expect(
      ensureConceptQuestionSet,
    ).toHaveBeenCalledTimes(1);

    expect(
      ensureConceptQuestionSet,
    ).toHaveBeenCalledWith(
      'pack-1',
      'concept-2',
    );

    expect(
      transactionStarted,
    ).toHaveBeenCalledTimes(1);

    /*
     * AI/question preparation must finish before the Prisma
     * transition transaction begins.
     */
    expect(
      ensureConceptQuestionSet.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      transactionStarted.mock
        .invocationCallOrder[0],
    );
  });
});
