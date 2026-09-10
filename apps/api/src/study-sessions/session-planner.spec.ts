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
  it('uses all concepts when fewer than five are available', () => {
    expect(getNormalSessionConceptLimit(0)).toBe(0);
    expect(getNormalSessionConceptLimit(1)).toBe(1);
    expect(getNormalSessionConceptLimit(3)).toBe(3);
    expect(getNormalSessionConceptLimit(4)).toBe(4);
  });

  it('uses all five concepts when exactly five are available', () => {
    expect(getNormalSessionConceptLimit(5)).toBe(5);
  });

  it('caps larger Study Packs at five concepts per session', () => {
    expect(getNormalSessionConceptLimit(6)).toBe(5);
    expect(getNormalSessionConceptLimit(12)).toBe(5);
    expect(getNormalSessionConceptLimit(13)).toBe(5);
    expect(getNormalSessionConceptLimit(120)).toBe(5);
    expect(getNormalSessionConceptLimit(500)).toBe(5);
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
      concept('05', {
        importance: 1,
        priorAttemptCount: 0,
      }),
      concept('06', {
        importance: 5,
        priorAttemptCount: 8,
      }),
    ]);

    expect(
      plan.selectedConcepts.map((item) => item.id),
    ).toEqual([
      '03',
      '02',
      '04',
      '05',
      '01',
    ]);
  });

  it('uses importance after previous exposure is equal', () => {
    const plan = planNormalStudySession([
      concept('01', { importance: 2 }),
      concept('02', { importance: 5 }),
      concept('03', { importance: 4 }),
      concept('04', { importance: 1 }),
      concept('05', { importance: 3 }),
      concept('06', { importance: 2 }),
    ]);

    expect(
      plan.selectedConcepts.map((item) => item.id),
    ).toEqual([
      '02',
      '03',
      '05',
      '01',
      '06',
    ]);
  });

  it('targets fifteen core checks for a normal large Study Pack', () => {
    const concepts = Array.from(
      { length: 20 },
      (_, index) =>
        concept(
          String(index + 1).padStart(2, '0'),
        ),
    );

    const plan = planNormalStudySession(concepts);

    expect(plan.selectedConcepts).toHaveLength(5);

    expect(
      plan.estimatedCoreQuestionCount,
    ).toBe(15);
  });

  it('naturally uses fewer than fifteen questions for a tiny Study Pack', () => {
    const plan = planNormalStudySession([
      concept('01'),
      concept('02'),
    ]);

    expect(plan.selectedConcepts).toHaveLength(2);
    expect(plan.estimatedCoreQuestionCount).toBe(6);
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

    expect(
      coverage.conceptRatio,
    ).toBeCloseTo(2 / 3);

    expect(
      coverage.weightedRatio,
    ).toBeCloseTo(0.8);
  });

  it('rejects invalid concept counts', () => {
    expect(() =>
      getNormalSessionConceptLimit(-1),
    ).toThrow('Invalid active concept count');

    expect(() =>
      getNormalSessionConceptLimit(1.5),
    ).toThrow('Invalid active concept count');
  });
});
