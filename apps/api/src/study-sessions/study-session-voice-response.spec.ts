import { LearningLoopNextStepResult } from '../learning-loop/learning-loop.service';

import { composeStudySessionVoiceResponse } from './study-session-voice-response';
import { StudySessionAnswerResult } from './study-sessions.service';

function makeResult(
  overrides: {
    action?: LearningLoopNextStepResult['action'] | null;

    correctness?: 'CORRECT' | 'PARTIAL' | 'INCORRECT';

    currentQuestion?: string | null;

    sessionStatus?: 'ACTIVE' | 'COMPLETED';

    remediationFocus?: string | null;

    remediationExplanation?: string;

    reviewCorrectness?: 'CORRECT' | 'PARTIAL' | 'INCORRECT' | null;
  } = {},
): StudySessionAnswerResult {
  const action = overrides.action ?? 'ASK_QUESTION';

  const learningStep =
    action === null
      ? null
      : ({
          action,

          remediation: overrides.remediationFocus
            ? {
                focusPoints: [overrides.remediationFocus],

                explanation:
                  overrides.remediationExplanation ??
                  'A deliberately long remediation explanation that should not be spoken in full.',

                keyTakeaways: [],
              }
            : null,
        } as LearningLoopNextStepResult);

  const reviewStep = overrides.reviewCorrectness
    ? ({
        correctness: overrides.reviewCorrectness,
      } as StudySessionAnswerResult['reviewStep'])
    : null;

  return {
    evaluation: {
      correctness: overrides.correctness ?? 'CORRECT',

      feedback:
        'This evaluator feedback is intentionally longer than we want Ryan to speak.',
    },

    learningStep,

    reviewStep,

    session: {
      status: overrides.sessionStatus ?? 'ACTIVE',

      currentQuestion:
        overrides.currentQuestion === null
          ? null
          : {
              prompt: overrides.currentQuestion ?? 'What comes next?',
            },
    },
  } as StudySessionAnswerResult;
}

describe('composeStudySessionVoiceResponse', () => {
  it('keeps successful progression concise', () => {
    const text = composeStudySessionVoiceResponse(makeResult());

    expect(text).toBe(
      "That's right. " + 'Next question. ' + 'What comes next?',
    );
  });

  it('speaks only the core remediation point', () => {
    const text = composeStudySessionVoiceResponse(
      makeResult({
        action: 'REMEDIATE_AND_ASK',

        correctness: 'INCORRECT',

        remediationFocus: 'The Beer-Lambert Law',

        currentQuestion: 'Which physical law is used?',
      }),
    );

    expect(text).toBe(
      'Not quite. ' +
        'The key idea is the Beer-Lambert Law. ' +
        "Let's try that again. " +
        'Which physical law is used?',
    );

    expect(text).not.toContain('deliberately long remediation');

    expect(text).not.toContain('evaluator feedback');
  });

  it('uses gentle feedback for partial answers', () => {
    const text = composeStudySessionVoiceResponse(
      makeResult({
        action: 'REMEDIATE_AND_ASK',

        correctness: 'PARTIAL',

        remediationFocus: 'light absorption',

        currentQuestion: 'Try explaining it again.',
      }),
    );

    expect(text).toContain("You're close.");

    expect(text).toContain('The key idea is light absorption.');
  });

  it('announces session completion concisely', () => {
    const text = composeStudySessionVoiceResponse(
      makeResult({
        action: 'ADVANCE_CONCEPT',

        sessionStatus: 'COMPLETED',

        currentQuestion: null,
      }),
    );

    expect(text).toBe(
      "That's right. " + 'You have completed this study session.',
    );
  });

  it('closes successful reviews concisely', () => {
    const text = composeStudySessionVoiceResponse(
      makeResult({
        action: null,

        reviewCorrectness: 'CORRECT',

        currentQuestion: null,
      }),
    );

    expect(text).toBe(
      "That's right. " + 'Nice work. ' + 'We will revisit this concept later.',
    );
  });
});
