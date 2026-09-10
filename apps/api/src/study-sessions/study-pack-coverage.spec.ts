import {
  calculateStudyPackCoreConceptCoverage,
  StudyPackCoverageCoreConcept,
} from './study-pack-coverage';

function coreConcept(
  id: string,
  importance: number,
  attemptCounts: number[],
): StudyPackCoverageCoreConcept {
  return {
    id,
    importance,
    atomicConcepts: attemptCounts.map((evaluatedNormalAttemptCount, index) => ({
      id: `${id}-atomic-${index + 1}`,
      evaluatedNormalAttemptCount,
    })),
  };
}

describe('Study Pack Core Concept coverage', () => {
  it('returns zero coverage for an empty hierarchy', () => {
    const coverage = calculateStudyPackCoreConceptCoverage([]);

    expect(coverage.totalCoreConceptCount).toBe(0);

    expect(coverage.coveredCoreConceptCount).toBe(0);

    expect(coverage.inProgressCoreConceptCount).toBe(0);

    expect(coverage.untouchedCoreConceptCount).toBe(0);

    expect(coverage.ratio).toBe(0);
    expect(coverage.weightedRatio).toBe(0);
  });

  it('classifies covered, in-progress, and untouched Core Concepts', () => {
    const coverage = calculateStudyPackCoreConceptCoverage([
      coreConcept('covered', 5, [2, 1]),

      coreConcept('partial', 3, [1, 0]),

      coreConcept('untouched', 2, [0]),
    ]);

    expect(coverage.totalCoreConceptCount).toBe(3);

    expect(coverage.coveredCoreConceptCount).toBe(1);

    expect(coverage.inProgressCoreConceptCount).toBe(1);

    expect(coverage.untouchedCoreConceptCount).toBe(1);

    expect(coverage.totalAtomicConceptCount).toBe(5);

    expect(coverage.testedAtomicConceptCount).toBe(3);

    expect(coverage.untestedAtomicConceptCount).toBe(2);

    expect(coverage.coreConcepts.map((item) => item.state)).toEqual([
      'COVERED',
      'IN_PROGRESS',
      'UNTOUCHED',
    ]);

    /*
     * Core ratios:
     *
     * 1.0, 0.5, 0.0
     *
     * Learner-facing unweighted coverage:
     * (1 + 0.5 + 0) / 3 = 0.5
     */
    expect(coverage.ratio).toBeCloseTo(0.5);

    /*
     * Importance weighted:
     *
     * (5*1 + 3*0.5 + 2*0) / 10
     * = 0.65
     */
    expect(coverage.weightedRatio).toBeCloseTo(0.65);
  });

  it('uses Core Concepts rather than Atomic Concepts as the coverage denominator', () => {
    const coverage = calculateStudyPackCoreConceptCoverage([
      coreConcept('large-core', 1, [1, 1, 1, 1, 1, 1, 1, 1, 1, 0]),

      coreConcept('small-core', 1, [0]),
    ]);

    /*
     * Large Core = 90%
     * Small Core = 0%
     *
     * Equal Core Concept importance means:
     *
     * (0.9 + 0.0) / 2 = 0.45
     *
     * NOT 9 / 11 atomic concepts.
     */
    expect(coverage.ratio).toBeCloseTo(0.45);

    expect(coverage.weightedRatio).toBeCloseTo(0.45);

    expect(coverage.ratio).not.toBeCloseTo(9 / 11);
  });

  it('does not require mastery for a Core Concept to be covered', () => {
    /*
     * Coverage input deliberately contains only
     * evaluated exposure counts.
     *
     * Mastery score is not part of this policy.
     */
    const coverage = calculateStudyPackCoreConceptCoverage([
      coreConcept('exposed-core', 4, [1, 1, 1]),
    ]);

    expect(coverage.coreConcepts[0].state).toBe('COVERED');

    expect(coverage.coveredCoreConceptCount).toBe(1);

    expect(coverage.weightedRatio).toBe(1);
  });

  it('rejects Core Concepts without active Atomic Concepts', () => {
    expect(() =>
      calculateStudyPackCoreConceptCoverage([
        {
          id: 'empty-core',
          importance: 3,
          atomicConcepts: [],
        },
      ]),
    ).toThrow('Core Concept empty-core has no active Atomic Concepts');
  });

  it('rejects invalid evaluated NORMAL attempt counts', () => {
    expect(() =>
      calculateStudyPackCoreConceptCoverage([
        coreConcept('invalid-core', 3, [-1]),
      ]),
    ).toThrow('Invalid evaluated NORMAL attempt count');

    expect(() =>
      calculateStudyPackCoreConceptCoverage([
        coreConcept('fractional-core', 3, [1.5]),
      ]),
    ).toThrow('Invalid evaluated NORMAL attempt count');
  });
});
