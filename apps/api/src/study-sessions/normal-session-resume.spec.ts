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

function makeActiveSessionState(sessionId = 'session-existing') {
  return {
    sessionId,
    studyPackId: 'pack-1',
    kind: 'NORMAL',
    status: 'ACTIVE',
    startedAt: new Date('2026-09-12T08:00:00.000Z'),
    completedAt: null,
    sessionNumber: 4,
    conceptCount: 5,
    progress: {
      completedConceptCount: 1,
      reviewRequiredCount: 0,
      remainingConceptCount: 4,
      answeredQuestionCount: 3,
      targetQuestionCount: 15,
      maximumQuestionCount: 20,
      remainingToTarget: 12,
      remainingToMaximum: 17,
      targetReached: false,
      maximumReached: false,
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
        score: 0.4,
        evidenceWeight: 1,
        attemptCount: 3,
      },
    },
    currentQuestion: {
      id: 'question-4',
      type: 'UNDERSTANDING',
      difficulty: 'MEDIUM',
      prompt: 'Explain Concept 1.',
    },
    conceptFlow: [],
  };
}

function makeConcept(index: number) {
  return {
    id: `concept-${index}`,
    name: `Concept ${index}`,
    importance: 3,
    difficulty: 'INTERMEDIATE',
    createdAt: new Date(`2026-01-${String(index).padStart(2, '0')}T00:00:00Z`),
    mastery: null,
  };
}

describe('StudySessionsService normal session resume', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resumes an ACTIVE Normal session before planning or preparing questions', async () => {
    const prisma = {
      studySession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'session-existing',
        }),
      },
      studyPack: {
        findUnique: jest.fn(),
      },
      concept: {
        findMany: jest.fn(),
      },
      questionAttempt: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const service = new StudySessionsService(prisma, {}, {}, {});

    jest
      .spyOn(service, 'getSessionState')
      .mockResolvedValue(makeActiveSessionState());

    const ensureConceptQuestionSet = jest.spyOn(
      service as any,
      'ensureConceptQuestionSet',
    );

    const result = await service.startSession('pack-1');

    expect(result.sessionId).toBe('session-existing');

    expect(prisma.studySession.findFirst).toHaveBeenCalledWith({
      where: {
        studyPackId: 'pack-1',
        kind: 'NORMAL',
        status: 'ACTIVE',
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
      },
    });

    expect(prisma.studyPack.findUnique).not.toHaveBeenCalled();

    expect(prisma.concept.findMany).not.toHaveBeenCalled();

    expect(prisma.questionAttempt.findMany).not.toHaveBeenCalled();

    expect(ensureConceptQuestionSet).not.toHaveBeenCalled();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('recovers from a concurrent P2002 start by resuming the winning session', async () => {
    const concepts = [
      makeConcept(1),
      makeConcept(2),
      makeConcept(3),
      makeConcept(4),
      makeConcept(5),
    ];

    const prisma = {
      studySession: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
          id: 'session-concurrent',
        }),
      },
      studyPack: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pack-1',
        }),
      },
      concept: {
        findMany: jest.fn().mockResolvedValue(concepts),
      },
      questionAttempt: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockRejectedValue({
        code: 'P2002',
      }),
    };

    const service = new StudySessionsService(prisma, {}, {}, {});

    jest.spyOn(Math, 'random').mockReturnValue(0);

    jest.spyOn(service as any, 'ensureConceptQuestionSet').mockResolvedValue([
      {
        id: 'recall-1',
        type: 'RECALL',
        difficulty: 'EASY',
        prompt: 'Recall Concept 1.',
      },
      {
        id: 'understanding-1',
        type: 'UNDERSTANDING',
        difficulty: 'MEDIUM',
        prompt: 'Explain Concept 1.',
      },
      {
        id: 'application-1',
        type: 'APPLICATION',
        difficulty: 'HARD',
        prompt: 'Apply Concept 1.',
      },
    ]);

    jest
      .spyOn(service, 'getSessionState')
      .mockResolvedValue(makeActiveSessionState('session-concurrent'));

    const result = await service.startSession('pack-1');

    expect(result.sessionId).toBe('session-concurrent');

    expect(prisma.studySession.findFirst).toHaveBeenCalledTimes(2);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
