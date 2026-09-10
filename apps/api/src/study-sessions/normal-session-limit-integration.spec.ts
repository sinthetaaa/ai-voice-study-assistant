/*
 * StudySessionsService imports several Nest services which ultimately
 * import the generated Prisma client.
 *
 * This test is concerned only with StudySession orchestration, so mock
 * those runtime dependencies before requiring StudySessionsService.
 *
 * Doing this keeps the test independent from Prisma/Jest module
 * resolution and from any real database.
 */

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

describe('StudySessionsService normal session question limit', () => {
  it('completes after question 20 without preparing another adaptive question', async () => {
    const prisma = {
      studySession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          studyPackId: 'pack-1',
          status: 'ACTIVE',
          kind: 'NORMAL',
          currentConceptId: 'concept-1',
          currentQuestionId: 'question-20',
        }),
      },

      sessionMasteryEvent: {
        count: jest.fn().mockResolvedValue(20),
      },
    };

    const evaluationsService = {
      evaluateQuestion: jest.fn().mockResolvedValue({
        evaluationId: 'evaluation-20',
        correctness: 'PARTIAL',
        questionType: 'APPLICATION',
        score: 0.6,
      }),
    };

    const learningLoopService = {
      getNextStep: jest.fn(),
    };

    const service = new StudySessionsService(
      prisma,
      {},
      evaluationsService,
      learningLoopService,
    );

    const applySessionMastery = jest
      .spyOn(service as any, 'applySessionMastery')
      .mockResolvedValue({
        masteryAfter: 0.65,
        evidenceWeightAfter: 4,
      });

    const completeAtLimit = jest
      .spyOn(
        service as any,
        'completeNormalSessionAtQuestionLimit',
      )
      .mockResolvedValue(undefined);

    jest
      .spyOn(service, 'getSessionState')
      .mockResolvedValue({
        sessionId: 'session-1',
        studyPackId: 'pack-1',
        kind: 'NORMAL',
        status: 'COMPLETED',
        startedAt: new Date(),
        completedAt: new Date(),
        sessionNumber: 1,
        conceptCount: 5,
        progress: {
          completedConceptCount: 3,
          reviewRequiredCount: 1,
          remainingConceptCount: 1,
        },
        currentConcept: null,
        currentQuestion: null,
        conceptFlow: [],
      });

    const result = await service.answerSession(
      'session-1',
      'My twentieth answer',
    );

    expect(
      evaluationsService.evaluateQuestion,
    ).toHaveBeenCalledTimes(1);

    expect(
      applySessionMastery,
    ).toHaveBeenCalledTimes(1);

    expect(
      prisma.sessionMasteryEvent.count,
    ).toHaveBeenCalledWith({
      where: {
        sessionId: 'session-1',
      },
    });

    expect(
      completeAtLimit,
    ).toHaveBeenCalledWith(
      'session-1',
      'concept-1',
      'APPLICATION',
    );

    /*
     * Critical V2 rule:
     *
     * once Question 20 is evaluated, do NOT enter the learning
     * loop because that can generate an ALTERNATE, SCAFFOLD,
     * remediation response, or eventually a RETEST.
     *
     * There must never be Question 21.
     */
    expect(
      learningLoopService.getNextStep,
    ).not.toHaveBeenCalled();

    expect(result.learningStep).toBeNull();
    expect(result.reviewStep).toBeNull();

    expect(result.session.status).toBe(
      'COMPLETED',
    );

    expect(
      result.session.currentQuestion,
    ).toBeNull();

    expect(
      result.session.currentConcept,
    ).toBeNull();
  });

  it('continues through the adaptive engine at question 19', async () => {
    const prisma = {
      studySession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          studyPackId: 'pack-1',
          status: 'ACTIVE',
          kind: 'NORMAL',
          currentConceptId: 'concept-1',
          currentQuestionId: 'question-19',
        }),
      },

      sessionMasteryEvent: {
        count: jest.fn().mockResolvedValue(19),
      },
    };

    const evaluationsService = {
      evaluateQuestion: jest.fn().mockResolvedValue({
        evaluationId: 'evaluation-19',
        correctness: 'CORRECT',
        questionType: 'RECALL',
        score: 1,
      }),
    };

    const learningStep = {
      studyPackId: 'pack-1',
      conceptId: 'concept-1',
      conceptName: 'Reinforcement Learning',
      evaluationId: 'evaluation-19',
      decisionVersion: 'v1',
      action: 'ASK_QUESTION',
      reasonCode:
        'CORRECT_RECALL_ADVANCE_LEVEL',
      reason: 'Advance to understanding.',
      mastery: {
        score: 0.5,
        evidenceWeight: 2,
      },
      question: {
        id: 'question-next',
        type: 'UNDERSTANDING',
        difficulty: 'MEDIUM',
        prompt: 'Explain the concept.',
      },
      remediation: null,
      nextQuestionType: 'UNDERSTANDING',
      retestQuestionType: null,
      reviewQuestionType: null,
    };

    const learningLoopService = {
      getNextStep:
        jest.fn().mockResolvedValue(
          learningStep,
        ),
    };

    const service = new StudySessionsService(
      prisma,
      {},
      evaluationsService,
      learningLoopService,
    );

    jest
      .spyOn(service as any, 'applySessionMastery')
      .mockResolvedValue({
        masteryAfter: 0.5,
        evidenceWeightAfter: 2,
      });

    jest
      .spyOn(
        service as any,
        'applyRecoveryClimbBackIfNeeded',
      )
      .mockResolvedValue(learningStep);

    jest
      .spyOn(
        service as any,
        'applyLearningStep',
      )
      .mockResolvedValue(undefined);

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
        currentConcept: null,
        currentQuestion: {
          id: 'question-next',
          type: 'UNDERSTANDING',
          difficulty: 'MEDIUM',
          prompt: 'Explain the concept.',
        },
        conceptFlow: [],
      });

    await service.answerSession(
      'session-1',
      'My nineteenth answer',
    );

    /*
     * Question 19 is still below the hard cap, so normal
     * adaptive progression remains active.
     */
    expect(
      learningLoopService.getNextStep,
    ).toHaveBeenCalledTimes(1);

    expect(
      learningLoopService.getNextStep,
    ).toHaveBeenCalledWith(
      'pack-1',
      'concept-1',
      'evaluation-19',
      {
        masteryAfter: 0.5,
        evidenceWeightAfter: 2,
      },
    );
  });
});
