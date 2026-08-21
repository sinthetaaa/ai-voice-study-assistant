export type SessionPlannerDifficulty =
  'FOUNDATIONAL' | 'INTERMEDIATE' | 'ADVANCED';

export type SessionPlannerConcept = {
  id: string;

  importance: number;

  difficulty: SessionPlannerDifficulty;

  createdAt: Date;

  /*
   * Number of evaluated NORMAL-session attempts previously
   * observed for this concept across the Study Pack.
   *
   * This affects CONTENT COVERAGE only.
   *
   * It does NOT carry mastery into the new session.
   */
  priorAttemptCount: number;
};

export type SessionPlan = {
  selectedConcepts: SessionPlannerConcept[];

  conceptLimit: number;

  estimatedCoreQuestionCount: number;
};

/*
 * StudyLoop deliberately avoids:
 *
 * pages -> questions
 *
 * Material size increases the concept universe and therefore
 * the number of sessions required for coverage.
 *
 * A single session remains bounded.
 */
export function getNormalSessionConceptLimit(
  totalActiveConcepts: number,
): number {
  if (!Number.isInteger(totalActiveConcepts) || totalActiveConcepts < 0) {
    throw new Error('Invalid active concept count');
  }

  if (totalActiveConcepts <= 3) {
    return totalActiveConcepts;
  }

  if (totalActiveConcepts <= 12) {
    return 3;
  }

  return 4;
}

export function planNormalStudySession(
  concepts: SessionPlannerConcept[],
): SessionPlan {
  const conceptLimit = getNormalSessionConceptLimit(concepts.length);

  /*
   * Coverage-aware ordering:
   *
   * 1. least previously tested
   * 2. highest importance
   * 3. foundational before advanced
   * 4. earlier stable creation order
   * 5. deterministic ID tie-breaker
   *
   * This means large packs naturally rotate through untouched
   * concepts instead of repeatedly selecting the same top few.
   */
  const ordered = [...concepts].sort((left, right) => {
    if (left.priorAttemptCount !== right.priorAttemptCount) {
      return left.priorAttemptCount - right.priorAttemptCount;
    }

    if (left.importance !== right.importance) {
      return right.importance - left.importance;
    }

    const difficultyDifference =
      difficultyRank(left.difficulty) - difficultyRank(right.difficulty);

    if (difficultyDifference !== 0) {
      return difficultyDifference;
    }

    const createdDifference =
      left.createdAt.getTime() - right.createdAt.getTime();

    if (createdDifference !== 0) {
      return createdDifference;
    }

    return left.id.localeCompare(right.id);
  });

  const selectedConcepts = ordered.slice(0, conceptLimit);

  return {
    selectedConcepts,

    conceptLimit,

    /*
     * Normal ladder:
     *
     * RECALL
     * UNDERSTANDING
     * APPLICATION
     *
     * Adaptive scaffold/retest questions may increase the actual
     * total, so this is deliberately only an estimate.
     */
    estimatedCoreQuestionCount: selectedConcepts.length * 3,
  };
}

export type StudyPackCoverageConcept = {
  id: string;

  importance: number;

  priorAttemptCount: number;
};

export type StudyPackCoverage = {
  totalConceptCount: number;

  testedConceptCount: number;

  untestedConceptCount: number;

  conceptRatio: number;

  weightedRatio: number;
};

export function calculateStudyPackCoverage(
  concepts: StudyPackCoverageConcept[],
): StudyPackCoverage {
  const tested = concepts.filter((concept) => concept.priorAttemptCount > 0);

  const totalImportance = concepts.reduce(
    (sum, concept) => sum + Math.max(1, concept.importance),
    0,
  );

  const testedImportance = tested.reduce(
    (sum, concept) => sum + Math.max(1, concept.importance),
    0,
  );

  return {
    totalConceptCount: concepts.length,

    testedConceptCount: tested.length,

    untestedConceptCount: concepts.length - tested.length,

    conceptRatio: concepts.length === 0 ? 0 : tested.length / concepts.length,

    weightedRatio:
      totalImportance === 0 ? 0 : testedImportance / totalImportance,
  };
}

function difficultyRank(difficulty: SessionPlannerDifficulty): number {
  switch (difficulty) {
    case 'FOUNDATIONAL':
      return 0;

    case 'INTERMEDIATE':
      return 1;

    case 'ADVANCED':
      return 2;
  }
}
