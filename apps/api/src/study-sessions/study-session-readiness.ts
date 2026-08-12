import {
  ADVANCE_EVIDENCE_THRESHOLD,
  ADVANCE_MASTERY_THRESHOLD,
} from '../adaptive/adaptive-policy';

export type StudyReadinessState = 'UNSEEN' | 'LEARNING' | 'MASTERED';

export type StudyReadinessMastery = {
  masteryScore: number;

  evidenceWeight: number;

  attemptCount: number;
} | null;

export type StudyReadinessResult = {
  state: StudyReadinessState;

  masteryScore: number;

  evidenceWeight: number;

  attemptCount: number;

  needsNormalStudy: boolean;
};

export function classifyStudyReadiness(
  mastery: StudyReadinessMastery,
): StudyReadinessResult {
  /*
   * No ConceptMastery row means StudyLoop has
   * never observed evaluated learner evidence
   * for this concept.
   */
  if (!mastery) {
    return {
      state: 'UNSEEN',

      masteryScore: 0.5,

      evidenceWeight: 0,

      attemptCount: 0,

      needsNormalStudy: true,
    };
  }

  /*
   * ConceptMastery can legitimately exist with
   * its neutral Beta(1, 1) prior before any
   * evaluated attempt has contributed evidence.
   */
  if (mastery.attemptCount === 0 || mastery.evidenceWeight === 0) {
    return {
      state: 'UNSEEN',

      masteryScore: mastery.masteryScore,

      evidenceWeight: mastery.evidenceWeight,

      attemptCount: mastery.attemptCount,

      needsNormalStudy: true,
    };
  }

  /*
   * IMPORTANT:
   *
   * Reuse the exact same definition of secure
   * mastery as the adaptive policy.
   *
   * A concept is MASTERED only when BOTH:
   *
   * masteryScore >= 0.70
   * evidenceWeight >= 2.50
   */
  const mastered =
    mastery.masteryScore >= ADVANCE_MASTERY_THRESHOLD &&
    mastery.evidenceWeight >= ADVANCE_EVIDENCE_THRESHOLD;

  if (mastered) {
    return {
      state: 'MASTERED',

      masteryScore: mastery.masteryScore,

      evidenceWeight: mastery.evidenceWeight,

      attemptCount: mastery.attemptCount,

      needsNormalStudy: false,
    };
  }

  return {
    state: 'LEARNING',

    masteryScore: mastery.masteryScore,

    evidenceWeight: mastery.evidenceWeight,

    attemptCount: mastery.attemptCount,

    needsNormalStudy: true,
  };
}
