import {
  calculateStudyPackCoverage,
  getNormalSessionConceptLimit,
  planNormalStudySession,
  SessionPlannerConcept,
} from './session-planner';

function concept(
  id: string,
  options: Partial<SessionPlannerConcept> = {},
): SessionPlannerConcept {
  return {
    id,

    importance: 3,

    difficulty: 'INTERMEDIATE',

    createdAt: new Date(`2026-01-${id.padStart(2, '0')}T00:00:00Z`),

    priorAttemptCount: 0,

    ...options,
  };
}

describe('session planner', () => {
  it('uses all concepts when the Study Pack is tiny', () => {
    expect(getNormalSessionConceptLimit(1)).toBe(1);

    expect(getNormalSessionConceptLimit(3)).toBe(3);
  });

  it('uses three concepts for a small or medium Study Pack', () => {
    expect(getNormalSessionConceptLimit(4)).toBe(3);

    expect(getNormalSessionConceptLimit(12)).toBe(3);
  });

  it('caps large Study Packs at four concepts per session', () => {
    expect(getNormalSessionConceptLimit(13)).toBe(4);

    expect(getNormalSessionConceptLimit(120)).toBe(4);

    expect(getNormalSessionConceptLimit(500)).toBe(4);
  });

  it('prioritizes untested concepts before previously tested concepts', () => {
    const plan = planNormalStudySession([
      concept('01', {
        importance: 5,
        priorAttemptCount: 5,
      }),

      concept('02', {
        importance: 3,
        priorAttemptCount: 0,
      }),

      concept('03', {
        importance: 4,
        priorAttemptCount: 0,
      }),

      concept('04', {
        importance: 2,
        priorAttemptCount: 0,
      }),
    ]);

    expect(plan.selectedConcepts.map((item) => item.id)).toEqual([
      '03',
      '02',
      '04',
    ]);
  });

  it('uses importance after previous exposure is equal', () => {
    const plan = planNormalStudySession([
      concept('01', { importance: 2 }),
      concept('02', { importance: 5 }),
      concept('03', { importance: 4 }),
      concept('04', { importance: 1 }),
    ]);

    expect(plan.selectedConcepts.map((item) => item.id)).toEqual([
      '02',
      '03',
      '01',
    ]);
  });

  it('estimates three core checks per selected concept', () => {
    const concepts = Array.from({ length: 20 }, (_, index) =>
      concept(String(index + 1).padStart(2, '0')),
    );

    const plan = planNormalStudySession(concepts);

    expect(plan.selectedConcepts).toHaveLength(4);

    expect(plan.estimatedCoreQuestionCount).toBe(12);
  });

  it('calculates concept and importance-weighted Study Pack coverage', () => {
    const coverage = calculateStudyPackCoverage([
      {
        id: 'a',
        importance: 5,
        priorAttemptCount: 2,
      },
      {
        id: 'b',
        importance: 3,
        priorAttemptCount: 1,
      },
      {
        id: 'c',
        importance: 2,
        priorAttemptCount: 0,
      },
    ]);

    expect(coverage.totalConceptCount).toBe(3);

    expect(coverage.testedConceptCount).toBe(2);

    expect(coverage.untestedConceptCount).toBe(1);

    expect(coverage.conceptRatio).toBeCloseTo(2 / 3);

    expect(coverage.weightedRatio).toBeCloseTo(0.8);
  });
});
