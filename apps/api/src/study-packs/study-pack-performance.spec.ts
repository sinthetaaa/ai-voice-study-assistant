import {
  summarizePerformanceAnswers,
  summarizePerformanceConcepts,
} from './study-pack-performance';

describe('Study Pack performance aggregation', () => {
  const now = new Date('2026-09-14T12:00:00.000Z');

  it('summarizes lifetime mastery only from evaluated concepts', () => {
    const result = summarizePerformanceConcepts(
      [
        {
          id: 'concept-1',
          name: 'Processes',
          importance: 5,
          difficulty: 'FOUNDATIONAL',

          mastery: {
            masteryScore: 0.8,
            evidenceWeight: 3,
            attemptCount: 3,

            reviewDueAt: new Date('2026-09-13T12:00:00.000Z'),

            lastReviewedAt: null,
          },
        },

        {
          id: 'concept-2',
          name: 'Virtual Memory',
          importance: 4,
          difficulty: 'INTERMEDIATE',

          mastery: {
            masteryScore: 0.6,
            evidenceWeight: 2,
            attemptCount: 2,

            reviewDueAt: new Date('2026-09-20T12:00:00.000Z'),

            lastReviewedAt: new Date('2026-09-10T12:00:00.000Z'),
          },
        },

        {
          id: 'concept-3',
          name: 'Deadlock',
          importance: 5,
          difficulty: 'ADVANCED',
          mastery: null,
        },
      ],
      now,
    );

    expect(result).toEqual({
      activeConceptCount: 3,

      evaluatedConceptCount: 2,
      unevaluatedConceptCount: 1,

      averageMastery: 0.7,

      totalMasteryAttempts: 5,
      totalEvidenceWeight: 5,

      scheduledReviewCount: 2,
      dueReviewCount: 1,
    });
  });

  it('does not treat neutral or absent mastery as demonstrated performance', () => {
    const result = summarizePerformanceConcepts(
      [
        {
          id: 'concept-1',
          name: 'Processes',
          importance: 5,
          difficulty: 'FOUNDATIONAL',

          mastery: {
            masteryScore: 0.5,
            evidenceWeight: 0,
            attemptCount: 0,

            reviewDueAt: null,
            lastReviewedAt: null,
          },
        },

        {
          id: 'concept-2',
          name: 'Paging',
          importance: 4,
          difficulty: 'INTERMEDIATE',
          mastery: null,
        },
      ],
      now,
    );

    expect(result.averageMastery).toBeNull();

    expect(result.evaluatedConceptCount).toBe(0);

    expect(result.unevaluatedConceptCount).toBe(2);
  });

  it('summarizes evaluated answer quality', () => {
    const result = summarizePerformanceAnswers([
      {
        score: 1,
        correctness: 'CORRECT',
      },
      {
        score: 0.6,
        correctness: 'PARTIAL',
      },
      {
        score: 0.2,
        correctness: 'INCORRECT',
      },
    ]);

    expect(result).toEqual({
      evaluatedAnswerCount: 3,

      averageScore: 0.6,

      correctness: {
        correct: 1,
        partial: 1,
        incorrect: 1,
      },
    });
  });

  it('returns null average answer score without evaluated answers', () => {
    expect(summarizePerformanceAnswers([])).toEqual({
      evaluatedAnswerCount: 0,

      averageScore: null,

      correctness: {
        correct: 0,
        partial: 0,
        incorrect: 0,
      },
    });
  });

  it('rejects an invalid normalized answer score', () => {
    expect(() =>
      summarizePerformanceAnswers([
        {
          score: 1.1,
          correctness: 'CORRECT',
        },
      ]),
    ).toThrow('Performance received invalid evaluation score 1.1');
  });
});
