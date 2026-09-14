export type PerformanceHierarchyMasteryInput = {
  masteryScore: number;

  evidenceWeight: number;

  attemptCount: number;
};

export type PerformanceHierarchyAtomicConceptInput = {
  id: string;

  mastery: PerformanceHierarchyMasteryInput | null;
};

export type PerformanceHierarchyCoreConceptInput = {
  id: string;

  name: string;

  importance: number;

  position: number;

  atomicConcepts: PerformanceHierarchyAtomicConceptInput[];
};

export type PerformanceHierarchyTopicInput = {
  id: string;

  name: string;

  position: number;

  coreConcepts: PerformanceHierarchyCoreConceptInput[];
};

export type PerformanceCoreConceptRollup = {
  id: string;

  name: string;

  topicId: string;

  topicName: string;

  topicPosition: number;

  importance: number;

  position: number;

  atomicConceptCount: number;

  evaluatedAtomicConceptCount: number;

  unevaluatedAtomicConceptCount: number;

  averageMastery: number | null;

  totalAttemptCount: number;

  totalEvidenceWeight: number;
};

export type PerformanceTopicRollup = {
  id: string;

  name: string;

  position: number;

  coreConceptCount: number;

  evaluatedCoreConceptCount: number;

  unevaluatedCoreConceptCount: number;

  atomicConceptCount: number;

  evaluatedAtomicConceptCount: number;

  averageMastery: number | null;
};

export type PerformanceCoreConceptHighlight = {
  id: string;

  name: string;

  topicId: string;

  topicName: string;

  averageMastery: number;

  evaluatedAtomicConceptCount: number;

  atomicConceptCount: number;
};

export type PerformanceHierarchySummary = {
  topics: PerformanceTopicRollup[];

  coreConcepts: PerformanceCoreConceptRollup[];

  strongestCoreConcept: PerformanceCoreConceptHighlight | null;

  weakestCoreConcept: PerformanceCoreConceptHighlight | null;
};

export function summarizePerformanceHierarchy(
  topics: PerformanceHierarchyTopicInput[],
): PerformanceHierarchySummary {
  const coreConcepts: PerformanceCoreConceptRollup[] = [];

  const topicRollups = topics.map((topic): PerformanceTopicRollup => {
    const topicCoreConcepts = topic.coreConcepts.map((coreConcept) =>
      summarizeCoreConcept(topic, coreConcept),
    );

    coreConcepts.push(...topicCoreConcepts);

    const evaluatedCoreConcepts = topicCoreConcepts.filter(
      (coreConcept) => coreConcept.averageMastery !== null,
    );

    const atomicConceptCount = topicCoreConcepts.reduce(
      (sum, coreConcept) => sum + coreConcept.atomicConceptCount,
      0,
    );

    const evaluatedAtomicConceptCount = topicCoreConcepts.reduce(
      (sum, coreConcept) => sum + coreConcept.evaluatedAtomicConceptCount,
      0,
    );

    /*
     * Topic mastery is intentionally the mean of
     * evaluated CORE CONCEPT mastery values.
     *
     * We do not average all Atomic Concepts directly,
     * because a Core Concept containing many extracted
     * atomics must not dominate a smaller Core Concept.
     */
    const averageMastery =
      evaluatedCoreConcepts.length === 0
        ? null
        : evaluatedCoreConcepts.reduce(
            (sum, coreConcept) => sum + coreConcept.averageMastery!,
            0,
          ) / evaluatedCoreConcepts.length;

    return {
      id: topic.id,

      name: topic.name,

      position: topic.position,

      coreConceptCount: topicCoreConcepts.length,

      evaluatedCoreConceptCount: evaluatedCoreConcepts.length,

      unevaluatedCoreConceptCount:
        topicCoreConcepts.length - evaluatedCoreConcepts.length,

      atomicConceptCount,

      evaluatedAtomicConceptCount,

      averageMastery,
    };
  });

  const evaluatedCoreConcepts = coreConcepts.filter(
    (
      coreConcept,
    ): coreConcept is PerformanceCoreConceptRollup & {
      averageMastery: number;
    } => coreConcept.averageMastery !== null,
  );

  const rankedDescending = [...evaluatedCoreConcepts].sort(
    compareStrongestFirst,
  );

  const rankedAscending = [...evaluatedCoreConcepts].sort(compareWeakestFirst);

  /*
   * Do not manufacture a "strength" and "weakness"
   * when there is not enough comparative evidence.
   *
   * One evaluated Core Concept, or multiple Core
   * Concepts tied at exactly the same mastery score,
   * provides no meaningful strongest/weakest split.
   */
  const hasMeaningfulRange =
    rankedDescending.length >= 2 &&
    rankedDescending[0].averageMastery > rankedAscending[0].averageMastery;

  return {
    topics: topicRollups,

    coreConcepts,

    strongestCoreConcept: hasMeaningfulRange
      ? toHighlight(rankedDescending[0])
      : null,

    weakestCoreConcept: hasMeaningfulRange
      ? toHighlight(rankedAscending[0])
      : null,
  };
}

function summarizeCoreConcept(
  topic: PerformanceHierarchyTopicInput,
  coreConcept: PerformanceHierarchyCoreConceptInput,
): PerformanceCoreConceptRollup {
  if (!Number.isFinite(coreConcept.importance)) {
    throw new Error(`Invalid importance for Core Concept ${coreConcept.id}`);
  }

  const evaluatedAtomicConcepts = coreConcept.atomicConcepts.filter(
    (atomicConcept) => {
      validateAtomicMastery(atomicConcept);

      return (
        atomicConcept.mastery !== null && atomicConcept.mastery.attemptCount > 0
      );
    },
  );

  const averageMastery =
    evaluatedAtomicConcepts.length === 0
      ? null
      : evaluatedAtomicConcepts.reduce(
          (sum, atomicConcept) => sum + atomicConcept.mastery!.masteryScore,
          0,
        ) / evaluatedAtomicConcepts.length;

  const totalAttemptCount = coreConcept.atomicConcepts.reduce(
    (sum, atomicConcept) => sum + (atomicConcept.mastery?.attemptCount ?? 0),
    0,
  );

  const totalEvidenceWeight = coreConcept.atomicConcepts.reduce(
    (sum, atomicConcept) => sum + (atomicConcept.mastery?.evidenceWeight ?? 0),
    0,
  );

  return {
    id: coreConcept.id,

    name: coreConcept.name,

    topicId: topic.id,

    topicName: topic.name,

    topicPosition: topic.position,

    importance: coreConcept.importance,

    position: coreConcept.position,

    atomicConceptCount: coreConcept.atomicConcepts.length,

    evaluatedAtomicConceptCount: evaluatedAtomicConcepts.length,

    unevaluatedAtomicConceptCount:
      coreConcept.atomicConcepts.length - evaluatedAtomicConcepts.length,

    averageMastery,

    totalAttemptCount,

    totalEvidenceWeight,
  };
}

function validateAtomicMastery(
  atomicConcept: PerformanceHierarchyAtomicConceptInput,
): void {
  const mastery = atomicConcept.mastery;

  if (!mastery) {
    return;
  }

  if (
    !Number.isFinite(mastery.masteryScore) ||
    mastery.masteryScore < 0 ||
    mastery.masteryScore > 1
  ) {
    throw new Error(
      `Invalid mastery score for Atomic Concept ${atomicConcept.id}`,
    );
  }

  if (!Number.isInteger(mastery.attemptCount) || mastery.attemptCount < 0) {
    throw new Error(
      `Invalid attempt count for Atomic Concept ${atomicConcept.id}`,
    );
  }

  if (!Number.isFinite(mastery.evidenceWeight) || mastery.evidenceWeight < 0) {
    throw new Error(
      `Invalid evidence weight for Atomic Concept ${atomicConcept.id}`,
    );
  }
}

function compareStrongestFirst(
  left: PerformanceCoreConceptRollup & {
    averageMastery: number;
  },
  right: PerformanceCoreConceptRollup & {
    averageMastery: number;
  },
): number {
  return (
    right.averageMastery - left.averageMastery ||
    left.topicPosition - right.topicPosition ||
    left.position - right.position ||
    left.id.localeCompare(right.id)
  );
}

function compareWeakestFirst(
  left: PerformanceCoreConceptRollup & {
    averageMastery: number;
  },
  right: PerformanceCoreConceptRollup & {
    averageMastery: number;
  },
): number {
  return (
    left.averageMastery - right.averageMastery ||
    left.topicPosition - right.topicPosition ||
    left.position - right.position ||
    left.id.localeCompare(right.id)
  );
}

function toHighlight(
  coreConcept: PerformanceCoreConceptRollup & {
    averageMastery: number;
  },
): PerformanceCoreConceptHighlight {
  return {
    id: coreConcept.id,

    name: coreConcept.name,

    topicId: coreConcept.topicId,

    topicName: coreConcept.topicName,

    averageMastery: coreConcept.averageMastery,

    evaluatedAtomicConceptCount: coreConcept.evaluatedAtomicConceptCount,

    atomicConceptCount: coreConcept.atomicConceptCount,
  };
}
