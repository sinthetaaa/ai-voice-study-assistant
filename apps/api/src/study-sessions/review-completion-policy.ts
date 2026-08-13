export type ReviewAnswerCorrectness = 'CORRECT' | 'PARTIAL' | 'INCORRECT';

export type ReviewQuestionType = 'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

export type ReviewCompletionReasonCode =
  | 'CORRECT_REVIEW_SPACED'
  | 'PARTIAL_REVIEW_REINFORCE'
  | 'INCORRECT_REVIEW_REINFORCE';

export type ReviewCompletionInput = {
  correctness: ReviewAnswerCorrectness;

  completedAt: Date;

  currentIntervalDays: number;

  reviewQuestionType: ReviewQuestionType;
};

export type ReviewCompletionDecision = {
  reasonCode: ReviewCompletionReasonCode;

  reason: string;

  nextReviewDueAt: Date;

  nextReviewIntervalDays: number;

  reviewQuestionType: ReviewQuestionType;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function completeConceptReview(
  input: ReviewCompletionInput,
): ReviewCompletionDecision {
  if (Number.isNaN(input.completedAt.getTime())) {
    throw new Error('completedAt must be a valid Date');
  }

  if (
    !Number.isInteger(input.currentIntervalDays) ||
    input.currentIntervalDays < 0
  ) {
    throw new Error('currentIntervalDays must be a non-negative integer');
  }

  if (input.correctness === 'CORRECT') {
    const nextIntervalDays = nextSuccessfulInterval(input.currentIntervalDays);

    return {
      reasonCode: 'CORRECT_REVIEW_SPACED',

      reason:
        'The scheduled review was correct, so the next review is spaced further into the future.',

      nextReviewDueAt: addDays(input.completedAt, nextIntervalDays),

      nextReviewIntervalDays: nextIntervalDays,

      reviewQuestionType: input.reviewQuestionType,
    };
  }

  const reasonCode =
    input.correctness === 'PARTIAL'
      ? 'PARTIAL_REVIEW_REINFORCE'
      : 'INCORRECT_REVIEW_REINFORCE';

  const reason =
    input.correctness === 'PARTIAL'
      ? 'The scheduled review was partially correct, so reinforcement is scheduled for the next day.'
      : 'The scheduled review was incorrect, so reinforcement is scheduled for the next day.';

  return {
    reasonCode,

    reason,

    nextReviewDueAt: addDays(input.completedAt, 1),

    nextReviewIntervalDays: 1,

    reviewQuestionType: input.reviewQuestionType,
  };
}

function nextSuccessfulInterval(currentIntervalDays: number): number {
  if (currentIntervalDays <= 1) {
    return 7;
  }

  if (currentIntervalDays <= 7) {
    return 14;
  }

  return 30;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MILLISECONDS_PER_DAY);
}
