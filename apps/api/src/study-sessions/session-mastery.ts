export type SessionMasteryQuestionType =
  'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

export type SessionMasteryState = {
  alpha: number;

  beta: number;

  masteryScore: number;

  evidenceWeight: number;

  attemptCount: number;
};

export type SessionMasteryUpdate = {
  weight: number;

  alphaBefore: number;

  betaBefore: number;

  masteryBefore: number;

  evidenceWeightBefore: number;

  attemptCountBefore: number;

  alphaAfter: number;

  betaAfter: number;

  masteryAfter: number;

  evidenceWeightAfter: number;

  attemptCountAfter: number;
};

export const INITIAL_SESSION_ALPHA = 1.0;

export const INITIAL_SESSION_BETA = 1.0;

/*
 * IMPORTANT:
 *
 * Internally we still use the neutral Beta(1, 1)
 * distribution.
 *
 * But a fresh session has observed ZERO learner
 * evidence, therefore the product-visible mastery
 * starts at 0 rather than displaying the neutral
 * Bayesian mean of 0.5.
 */
export const INITIAL_SESSION_MASTERY_SCORE = 0.0;

export const INITIAL_SESSION_EVIDENCE_WEIGHT = 0.0;

export const INITIAL_SESSION_ATTEMPT_COUNT = 0;

const QUESTION_WEIGHTS: Record<SessionMasteryQuestionType, number> = {
  RECALL: 0.75,

  UNDERSTANDING: 1.0,

  APPLICATION: 1.25,
};

export function updateSessionMastery(
  state: SessionMasteryState,
  questionType: SessionMasteryQuestionType,
  score: number,
): SessionMasteryUpdate {
  validateState(state);

  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error(`Session mastery received invalid score ${score}`);
  }

  const weight = QUESTION_WEIGHTS[questionType];

  const alphaBefore = state.alpha;

  const betaBefore = state.beta;

  /*
   * Before the first evaluated answer, the
   * learner-visible mastery is explicitly 0.
   *
   * After evidence exists, mastery is the
   * posterior Beta mean.
   */
  const masteryBefore =
    state.attemptCount === 0 ? 0 : calculatePosterior(alphaBefore, betaBefore);

  const alphaAfter = alphaBefore + weight * score;

  const betaAfter = betaBefore + weight * (1 - score);

  const masteryAfter = calculatePosterior(alphaAfter, betaAfter);

  const evidenceWeightAfter = state.evidenceWeight + weight;

  const attemptCountAfter = state.attemptCount + 1;

  return {
    weight,

    alphaBefore,

    betaBefore,

    masteryBefore,

    evidenceWeightBefore: state.evidenceWeight,

    attemptCountBefore: state.attemptCount,

    alphaAfter,

    betaAfter,

    masteryAfter,

    evidenceWeightAfter,

    attemptCountAfter,
  };
}

function calculatePosterior(alpha: number, beta: number): number {
  const denominator = alpha + beta;

  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new Error('Invalid session mastery distribution');
  }

  return alpha / denominator;
}

function validateState(state: SessionMasteryState): void {
  if (!Number.isFinite(state.alpha) || state.alpha <= 0) {
    throw new Error('Invalid session mastery alpha');
  }

  if (!Number.isFinite(state.beta) || state.beta <= 0) {
    throw new Error('Invalid session mastery beta');
  }

  if (!Number.isFinite(state.evidenceWeight) || state.evidenceWeight < 0) {
    throw new Error('Invalid session mastery evidence weight');
  }

  if (!Number.isInteger(state.attemptCount) || state.attemptCount < 0) {
    throw new Error('Invalid session mastery attempt count');
  }
}
