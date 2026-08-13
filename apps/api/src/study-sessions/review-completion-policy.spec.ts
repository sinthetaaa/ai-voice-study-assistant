import { completeConceptReview } from './review-completion-policy';

describe('completeConceptReview', () => {
  const completedAt = new Date('2026-08-13T10:00:00.000Z');

  it('moves a successful 1-day review to 7 days', () => {
    const result = completeConceptReview({
      correctness: 'CORRECT',
      completedAt,
      currentIntervalDays: 1,
      reviewQuestionType: 'APPLICATION',
    });

    expect(result.nextReviewIntervalDays).toBe(7);

    expect(result.nextReviewDueAt.toISOString()).toBe(
      '2026-08-20T10:00:00.000Z',
    );
  });

  it('moves a successful 7-day review to 14 days', () => {
    const result = completeConceptReview({
      correctness: 'CORRECT',
      completedAt,
      currentIntervalDays: 7,
      reviewQuestionType: 'APPLICATION',
    });

    expect(result.nextReviewIntervalDays).toBe(14);
  });

  it('moves later successful reviews to 30 days', () => {
    const result = completeConceptReview({
      correctness: 'CORRECT',
      completedAt,
      currentIntervalDays: 14,
      reviewQuestionType: 'APPLICATION',
    });

    expect(result.nextReviewIntervalDays).toBe(30);
  });

  it('schedules a partial review for the next day', () => {
    const result = completeConceptReview({
      correctness: 'PARTIAL',
      completedAt,
      currentIntervalDays: 7,
      reviewQuestionType: 'APPLICATION',
    });

    expect(result.nextReviewIntervalDays).toBe(1);

    expect(result.reasonCode).toBe('PARTIAL_REVIEW_REINFORCE');
  });

  it('schedules an incorrect review for the next day', () => {
    const result = completeConceptReview({
      correctness: 'INCORRECT',
      completedAt,
      currentIntervalDays: 14,
      reviewQuestionType: 'UNDERSTANDING',
    });

    expect(result.nextReviewIntervalDays).toBe(1);

    expect(result.reviewQuestionType).toBe('UNDERSTANDING');
  });
});
