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

export const INITIAL_SESSION_MASTERY_SCORE = 0.0;

export const INITIAL_SESSION_EVIDENCE_WEIGHT = 0.0;

export const INITIAL_SESSION_ATTEMPT_COUNT = 0;

/*
 * Evidence target used by the learner-visible confidence model.
 *
 * Four weighted evidence units are enough to fully unlock the
 * evidence-confidence component.
 *
 * A normal:
 *
 * RECALL        = 0.75
 * UNDERSTANDING = 1.00
 * APPLICATION   = 1.25
 *
 * sequence therefore contributes 3.00 evidence units.
 *
 * This means three perfect answers can establish strong mastery,
 * but additional successful evidence can still strengthen it.
 */
export const SESSION_CONFIDENCE_EVIDENCE_TARGET = 4.0;

/*
 * At least three independent evaluated attempts are required
 * before the attempt-confidence component becomes fully unlocked.
 *
 * This prevents one excellent answer from being displayed as
 * near-complete concept mastery.
 */
export const SESSION_CONFIDENCE_ATTEMPT_TARGET = 3;

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
   * Visible mastery is persisted explicitly.
   *
   * Never reconstruct learner-visible mastery from the internal
   * Beta posterior because Beta(1, 1) contains a neutral prior
   * rather than demonstrated learner knowledge.
   */
  const masteryBefore = state.masteryScore;

  /*
   * Keep the Beta-style evidence accumulator because it gives us
   * an auditable representation of positive and negative evidence.
   *
   * The learner-visible mastery is intentionally calculated
   * separately below.
   */
  const alphaAfter = alphaBefore + weight * score;

  const betaAfter = betaBefore + weight * (1 - score);

  const evidenceWeightAfter = state.evidenceWeight + weight;

  const attemptCountAfter = state.attemptCount + 1;

  /*
   * alpha begins at 1.0.
   *
   * Therefore:
   *
   * alpha - INITIAL_SESSION_ALPHA
   *
   * equals the total accumulated:
   *
   * questionWeight × answerScore
   *
   * from THIS session only.
   */
  const demonstratedPositiveEvidence = Math.max(
    0,
    alphaAfter - INITIAL_SESSION_ALPHA,
  );

  const demonstratedPerformance =
    evidenceWeightAfter > 0
      ? clamp01(demonstratedPositiveEvidence / evidenceWeightAfter)
      : 0;

  /*
   * Evidence confidence answers:
   *
   * "Have we collected enough weighted evidence to trust the
   * observed performance?"
   */
  const evidenceConfidence = clamp01(
    evidenceWeightAfter / SESSION_CONFIDENCE_EVIDENCE_TARGET,
  );

  /*
   * Attempt confidence answers:
   *
   * "Have we observed enough independent attempts to treat this
   * as mastery rather than one lucky/good response?"
   */
  const attemptConfidence = clamp01(
    attemptCountAfter / SESSION_CONFIDENCE_ATTEMPT_TARGET,
  );

  /*
   * Final learner-visible concept mastery.
   *
   * A learner needs BOTH:
   *
   * 1. strong demonstrated performance
   * 2. sufficient evidence
   *
   * before StudyLoop displays high mastery.
   */
  const masteryAfter = clamp01(
    demonstratedPerformance * evidenceConfidence * attemptConfidence,
  );

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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function validateState(state: SessionMasteryState): void {
  if (!Number.isFinite(state.alpha) || state.alpha <= 0) {
    throw new Error('Invalid session mastery alpha');
  }

  if (!Number.isFinite(state.beta) || state.beta <= 0) {
    throw new Error('Invalid session mastery beta');
  }

  if (
    !Number.isFinite(state.masteryScore) ||
    state.masteryScore < 0 ||
    state.masteryScore > 1
  ) {
    throw new Error('Invalid session mastery score');
  }

  if (!Number.isFinite(state.evidenceWeight) || state.evidenceWeight < 0) {
    throw new Error('Invalid session mastery evidence weight');
  }

  if (!Number.isInteger(state.attemptCount) || state.attemptCount < 0) {
    throw new Error('Invalid session mastery attempt count');
  }
}
