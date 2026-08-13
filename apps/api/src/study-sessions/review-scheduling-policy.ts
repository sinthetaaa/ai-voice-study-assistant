import { AdaptiveQuestionType } from '../adaptive/adaptive-policy';

export type ReviewSchedulingAction = 'ADVANCE_CONCEPT' | 'ADVANCE_WITH_REVIEW';

export type ReviewScheduleReason =
  'MASTERY_MAINTENANCE' | 'EARLY_REINFORCEMENT';

export type ReviewScheduleInput = {
  action: ReviewSchedulingAction;

  completedAt: Date;

  reviewQuestionType: AdaptiveQuestionType | null;
};

export type ReviewScheduleDecision = {
  reason: ReviewScheduleReason;

  reviewDueAt: Date;

  reviewQuestionType: AdaptiveQuestionType;

  reviewIntervalDays: number;
};

export const MASTERY_REVIEW_INTERVAL_DAYS = 7;

export const REINFORCEMENT_REVIEW_INTERVAL_DAYS = 1;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function scheduleConceptReview(
  input: ReviewScheduleInput,
): ReviewScheduleDecision {
  if (Number.isNaN(input.completedAt.getTime())) {
    throw new Error('completedAt must be a valid Date');
  }

  /*
   * Securely mastered concepts leave normal
   * study, but they should not disappear
   * forever.
   *
   * Schedule an APPLICATION-level maintenance
   * check one week later.
   */
  if (input.action === 'ADVANCE_CONCEPT') {
    return {
      reason: 'MASTERY_MAINTENANCE',

      reviewDueAt: addDays(input.completedAt, MASTERY_REVIEW_INTERVAL_DAYS),

      reviewQuestionType: 'APPLICATION',

      reviewIntervalDays: MASTERY_REVIEW_INTERVAL_DAYS,
    };
  }

  /*
   * ADVANCE_WITH_REVIEW means the learner
   * answered APPLICATION correctly, but the
   * accumulated mastery/evidence was not strong
   * enough for secure mastery.
   *
   * Preserve the adaptive policy's requested
   * retest level and schedule it soon.
   */
  if (!input.reviewQuestionType) {
    throw new Error('ADVANCE_WITH_REVIEW requires a reviewQuestionType');
  }

  return {
    reason: 'EARLY_REINFORCEMENT',

    reviewDueAt: addDays(input.completedAt, REINFORCEMENT_REVIEW_INTERVAL_DAYS),

    reviewQuestionType: input.reviewQuestionType,

    reviewIntervalDays: REINFORCEMENT_REVIEW_INTERVAL_DAYS,
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MILLISECONDS_PER_DAY);
}
