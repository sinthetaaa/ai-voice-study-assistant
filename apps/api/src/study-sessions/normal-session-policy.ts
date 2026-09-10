/*
 * NORMAL STUDY SESSION V2
 *
 * One StudySession represents one learner sitting.
 *
 * The normal baseline is:
 *
 *   5 concepts
 *   ×
 *   RECALL → UNDERSTANDING → APPLICATION
 *   =
 *   15 core questions
 *
 * Adaptive remediation/recovery may add questions, but the
 * learner must never be trapped in an unbounded session.
 */

export const NORMAL_SESSION_TARGET_CONCEPT_COUNT = 5;

export const NORMAL_SESSION_TARGET_QUESTION_COUNT = 15;

export const NORMAL_SESSION_MAX_QUESTION_COUNT = 20;

export type NormalSessionLimitDecision =
  | {
      reachedLimit: false;
      answeredQuestionCount: number;
      maximumQuestionCount: number;
    }
  | {
      reachedLimit: true;
      answeredQuestionCount: number;
      maximumQuestionCount: number;
      reason: 'QUESTION_LIMIT_REACHED';
    };

/*
 * Question count means successfully persisted/evaluated
 * QuestionAttempt rows.
 *
 * Failed microphone capture, failed transcription, etc. do not
 * consume the learner's question budget because no evaluated
 * answer exists yet.
 */
export function evaluateNormalSessionQuestionLimit(
  answeredQuestionCount: number,
): NormalSessionLimitDecision {
  if (
    !Number.isInteger(answeredQuestionCount) ||
    answeredQuestionCount < 0
  ) {
    throw new Error(
      'answeredQuestionCount must be a non-negative integer',
    );
  }

  if (answeredQuestionCount >= NORMAL_SESSION_MAX_QUESTION_COUNT) {
    return {
      reachedLimit: true,
      answeredQuestionCount,
      maximumQuestionCount: NORMAL_SESSION_MAX_QUESTION_COUNT,
      reason: 'QUESTION_LIMIT_REACHED',
    };
  }

  return {
    reachedLimit: false,
    answeredQuestionCount,
    maximumQuestionCount: NORMAL_SESSION_MAX_QUESTION_COUNT,
  };
}
