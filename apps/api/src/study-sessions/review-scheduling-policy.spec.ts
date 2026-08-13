import {
  MASTERY_REVIEW_INTERVAL_DAYS,
  REINFORCEMENT_REVIEW_INTERVAL_DAYS,
  scheduleConceptReview,
} from './review-scheduling-policy';

describe('scheduleConceptReview', () => {
  const completedAt = new Date('2026-08-13T00:00:00.000Z');

  it('schedules secure mastery maintenance after 7 days', () => {
    const result = scheduleConceptReview({
      action: 'ADVANCE_CONCEPT',

      completedAt,

      reviewQuestionType: null,
    });

    expect(result.reason).toBe('MASTERY_MAINTENANCE');

    expect(result.reviewQuestionType).toBe('APPLICATION');

    expect(result.reviewIntervalDays).toBe(MASTERY_REVIEW_INTERVAL_DAYS);

    expect(result.reviewDueAt.toISOString()).toBe('2026-08-20T00:00:00.000Z');
  });

  it('schedules early reinforcement after 1 day', () => {
    const result = scheduleConceptReview({
      action: 'ADVANCE_WITH_REVIEW',

      completedAt,

      reviewQuestionType: 'APPLICATION',
    });

    expect(result.reason).toBe('EARLY_REINFORCEMENT');

    expect(result.reviewQuestionType).toBe('APPLICATION');

    expect(result.reviewIntervalDays).toBe(REINFORCEMENT_REVIEW_INTERVAL_DAYS);

    expect(result.reviewDueAt.toISOString()).toBe('2026-08-14T00:00:00.000Z');
  });

  it('preserves the adaptive review question level', () => {
    const result = scheduleConceptReview({
      action: 'ADVANCE_WITH_REVIEW',

      completedAt,

      reviewQuestionType: 'UNDERSTANDING',
    });

    expect(result.reviewQuestionType).toBe('UNDERSTANDING');
  });

  it('rejects reinforcement without a review level', () => {
    expect(() =>
      scheduleConceptReview({
        action: 'ADVANCE_WITH_REVIEW',

        completedAt,

        reviewQuestionType: null,
      }),
    ).toThrow('ADVANCE_WITH_REVIEW requires a reviewQuestionType');
  });

  it('rejects an invalid completion date', () => {
    expect(() =>
      scheduleConceptReview({
        action: 'ADVANCE_CONCEPT',

        completedAt: new Date('invalid'),

        reviewQuestionType: null,
      }),
    ).toThrow('completedAt must be a valid Date');
  });
});
