import { StudySessionAnswerResult } from './study-sessions.service';

import { composeStudySessionVoiceResponse } from './study-session-voice-response';

function makeResult(
  overrides: Partial<StudySessionAnswerResult> = {},
): StudySessionAnswerResult {
  return {
    evaluation: {
      studyPackId: 'pack-1',

      conceptId: 'concept-1',

      questionId: 'question-1',

      studySessionId: 'session-1',

      attemptId: 'attempt-1',

      evaluationId: 'evaluation-1',

      questionType: 'RECALL',

      difficulty: 'EASY',

      answerText: 'Sample learner answer',

      score: 1,

      correctness: 'CORRECT',

      feedback: 'You correctly identified the central idea.',

      missingPoints: [],

      misconceptions: [],

      evaluatorProvider: 'test',

      evaluatorModel: 'test',

      evaluatorVersion: 'test',

      createdAt: new Date(),

      masteryStatus: 'APPLIED',

      mastery: null,
    },

    learningStep: {
      studyPackId: 'pack-1',

      conceptId: 'concept-1',

      conceptName: 'Test Concept',

      evaluationId: 'evaluation-1',

      decisionVersion: 'test',

      action: 'ASK_QUESTION',

      reasonCode: 'TEST',

      reason: 'test',

      mastery: {
        score: 0.5,

        evidenceWeight: 1,
      },

      question: {
        id: 'question-2',

        type: 'UNDERSTANDING',

        difficulty: 'MEDIUM',

        prompt: 'What comes next?',
      },

      remediation: null,

      nextQuestionType: 'UNDERSTANDING',

      retestQuestionType: null,

      reviewQuestionType: null,
    },

    reviewStep: null,

    session: {
      sessionId: 'session-1',

      studyPackId: 'pack-1',

      kind: 'NORMAL',

      status: 'ACTIVE',

      startedAt: new Date(),

      completedAt: null,

      conceptCount: 1,

      progress: {
        completedConceptCount: 0,

        reviewRequiredCount: 0,

        remainingConceptCount: 1,
      },

      currentConcept: null,

      currentQuestion: {
        id: 'question-2',

        type: 'UNDERSTANDING',

        difficulty: 'MEDIUM',

        prompt: 'What comes next?',
      },

      conceptFlow: [],
    },

    ...overrides,
  };
}

describe('composeStudySessionVoiceResponse', () => {
  it('explains successful progression without speaking the next question', () => {
    const text = composeStudySessionVoiceResponse(makeResult());

    expect(text).toBe(
      "That's right. " + 'You correctly identified the central idea.',
    );

    expect(text).not.toContain('What comes next?');

    expect(text).not.toContain('Next question');
  });

  it('speaks concise remediation without appending the retry question', () => {
    const result = makeResult({
      evaluation: {
        ...makeResult().evaluation,

        correctness: 'INCORRECT',

        score: 0,

        feedback: '',
      },

      learningStep: {
        ...makeResult().learningStep!,

        action: 'REMEDIATE_AND_ASK',

        question: {
          id: 'question-3',

          type: 'RECALL',

          difficulty: 'EASY',

          prompt: 'Which physical law is used?',
        },

        remediation: {
          kind: 'GENERAL_GAP',

          focusPoints: ['The Beer-Lambert Law'],

          explanation:
            'A deliberately long remediation explanation that should not be spoken in full.',

          keyTakeaways: [],

          evidenceChunkIds: [],

          generatorProvider: 'test',

          generatorModel: 'test',

          generatorVersion: 'test',
        },
      },
    });

    const text = composeStudySessionVoiceResponse(result);

    expect(text).toBe('Not quite. ' + 'The key idea is the Beer-Lambert Law.');

    expect(text).not.toContain('Which physical law is used?');

    expect(text).not.toContain('deliberately long remediation');
  });

  it('uses gentle analysis for partial answers', () => {
    const result = makeResult({
      evaluation: {
        ...makeResult().evaluation,

        correctness: 'PARTIAL',

        score: 0.5,

        feedback: '',

        missingPoints: [],
      },

      learningStep: {
        ...makeResult().learningStep!,

        action: 'REMEDIATE_AND_ASK',

        remediation: {
          kind: 'MISSING_POINTS',

          focusPoints: ['light absorption'],

          explanation: '',

          keyTakeaways: [],

          evidenceChunkIds: [],

          generatorProvider: 'test',

          generatorModel: 'test',

          generatorVersion: 'test',
        },
      },
    });

    const text = composeStudySessionVoiceResponse(result);

    expect(text).toContain("You're close.");

    expect(text).toContain('The key idea is light absorption.');

    expect(text).not.toContain('What comes next?');
  });

  it('announces completion without another question', () => {
    const result = makeResult({
      evaluation: {
        ...makeResult().evaluation,

        feedback: '',
      },

      session: {
        ...makeResult().session,

        status: 'COMPLETED',

        currentQuestion: null,
      },
    });

    const text = composeStudySessionVoiceResponse(result);

    expect(text).toBe(
      "That's right. " + 'You have completed this study session.',
    );
  });

  it('keeps successful review feedback concise', () => {
    const result = makeResult({
      evaluation: {
        ...makeResult().evaluation,

        feedback:
          'This evaluator feedback should not be read after a correct review answer.',
      },

      learningStep: null,

      reviewStep: {
        correctness: 'CORRECT',

        reviewOutcome: 'SECURE',

        reviewRequired: false,

        completed: true,
      } as never,
    });

    const text = composeStudySessionVoiceResponse(result);

    expect(text).toBe(
      "That's right. " + 'Nice work. ' + 'We will revisit this concept later.',
    );
  });

  it('can mention an important missing point without speaking a future question', () => {
    const result = makeResult({
      evaluation: {
        ...makeResult().evaluation,

        correctness: 'PARTIAL',

        feedback: 'You identified the broad idea.',

        missingPoints: ['The residual is included in the training objective.'],
      },
    });

    const text = composeStudySessionVoiceResponse(result);

    expect(text).toContain('You identified the broad idea.');

    expect(text).toContain(
      'One important point to add is the residual is included in the training objective.',
    );

    expect(text).not.toContain('What comes next?');
  });
});
