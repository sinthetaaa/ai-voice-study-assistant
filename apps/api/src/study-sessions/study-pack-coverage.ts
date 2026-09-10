export type CoreConceptCoverageState = 'UNTOUCHED' | 'IN_PROGRESS' | 'COVERED';

export type StudyPackCoverageAtomicConcept = {
  id: string;

  /*
   * Number of evaluated attempts belonging to
   * NORMAL Study Sessions for this Atomic Concept.
   *
   * Coverage is about exposure to the material.
   * It is deliberately independent of mastery.
   */
  evaluatedNormalAttemptCount: number;
};

export type StudyPackCoverageCoreConcept = {
  id: string;
  importance: number;
  atomicConcepts: StudyPackCoverageAtomicConcept[];
};

export type CoreConceptCoverageSnapshot = {
  id: string;
  importance: number;

  atomicConceptCount: number;
  testedAtomicConceptCount: number;
  untestedAtomicConceptCount: number;

  ratio: number;
  state: CoreConceptCoverageState;
};

export type StudyPackCoreConceptCoverage = {
  totalCoreConceptCount: number;

  coveredCoreConceptCount: number;
  inProgressCoreConceptCount: number;
  untouchedCoreConceptCount: number;

  totalAtomicConceptCount: number;
  testedAtomicConceptCount: number;
  untestedAtomicConceptCount: number;

  /*
   * Unweighted mean of Core Concept coverage ratios.
   *
   * Every Core Concept receives one learner-facing
   * denominator slot regardless of how many Atomic
   * Concepts the hierarchy contains beneath it.
   */
  ratio: number;

  /*
   * Core Concept importance-weighted mean.
   *
   * Atomic Concept count does not directly weight
   * Study Pack coverage.
   */
  weightedRatio: number;

  coreConcepts: CoreConceptCoverageSnapshot[];
};

export function calculateStudyPackCoreConceptCoverage(
  coreConcepts: StudyPackCoverageCoreConcept[],
): StudyPackCoreConceptCoverage {
  const snapshots = coreConcepts.map(
    (coreConcept): CoreConceptCoverageSnapshot => {
      if (!Number.isFinite(coreConcept.importance)) {
        throw new Error(
          `Invalid importance for Core Concept ${coreConcept.id}`,
        );
      }

      if (coreConcept.atomicConcepts.length === 0) {
        throw new Error(
          `Core Concept ${coreConcept.id} has no active Atomic Concepts`,
        );
      }

      for (const atomicConcept of coreConcept.atomicConcepts) {
        if (
          !Number.isInteger(atomicConcept.evaluatedNormalAttemptCount) ||
          atomicConcept.evaluatedNormalAttemptCount < 0
        ) {
          throw new Error(
            `Invalid evaluated NORMAL attempt count for Atomic Concept ${atomicConcept.id}`,
          );
        }
      }

      const testedAtomicConceptCount = coreConcept.atomicConcepts.filter(
        (atomicConcept) => atomicConcept.evaluatedNormalAttemptCount > 0,
      ).length;

      const atomicConceptCount = coreConcept.atomicConcepts.length;

      const ratio = testedAtomicConceptCount / atomicConceptCount;

      let state: CoreConceptCoverageState;

      if (testedAtomicConceptCount === 0) {
        state = 'UNTOUCHED';
      } else if (testedAtomicConceptCount === atomicConceptCount) {
        state = 'COVERED';
      } else {
        state = 'IN_PROGRESS';
      }

      return {
        id: coreConcept.id,
        importance: coreConcept.importance,

        atomicConceptCount,
        testedAtomicConceptCount,
        untestedAtomicConceptCount:
          atomicConceptCount - testedAtomicConceptCount,

        ratio,
        state,
      };
    },
  );

  const totalCoreConceptCount = snapshots.length;

  const coveredCoreConceptCount = snapshots.filter(
    (coreConcept) => coreConcept.state === 'COVERED',
  ).length;

  const inProgressCoreConceptCount = snapshots.filter(
    (coreConcept) => coreConcept.state === 'IN_PROGRESS',
  ).length;

  const untouchedCoreConceptCount = snapshots.filter(
    (coreConcept) => coreConcept.state === 'UNTOUCHED',
  ).length;

  const totalAtomicConceptCount = snapshots.reduce(
    (sum, coreConcept) => sum + coreConcept.atomicConceptCount,
    0,
  );

  const testedAtomicConceptCount = snapshots.reduce(
    (sum, coreConcept) => sum + coreConcept.testedAtomicConceptCount,
    0,
  );

  /*
   * This is intentionally the mean of CORE CONCEPT
   * ratios rather than:
   *
   * tested atomic concepts / total atomic concepts.
   *
   * Therefore hierarchy extraction granularity does not
   * distort the learner-facing denominator.
   */
  const ratio =
    totalCoreConceptCount === 0
      ? 0
      : snapshots.reduce((sum, coreConcept) => sum + coreConcept.ratio, 0) /
        totalCoreConceptCount;

  const totalImportance = snapshots.reduce(
    (sum, coreConcept) => sum + Math.max(1, coreConcept.importance),
    0,
  );

  const weightedProgress = snapshots.reduce(
    (sum, coreConcept) =>
      sum + Math.max(1, coreConcept.importance) * coreConcept.ratio,
    0,
  );

  return {
    totalCoreConceptCount,

    coveredCoreConceptCount,
    inProgressCoreConceptCount,
    untouchedCoreConceptCount,

    totalAtomicConceptCount,
    testedAtomicConceptCount,
    untestedAtomicConceptCount:
      totalAtomicConceptCount - testedAtomicConceptCount,

    ratio,

    weightedRatio:
      totalImportance === 0 ? 0 : weightedProgress / totalImportance,

    coreConcepts: snapshots,
  };
}
