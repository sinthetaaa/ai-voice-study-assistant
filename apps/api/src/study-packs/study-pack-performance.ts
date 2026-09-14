export type PerformanceMasteryInput = {
  masteryScore: number;
  evidenceWeight: number;
  attemptCount: number;

  reviewDueAt: Date | null;
  lastReviewedAt: Date | null;
};

export type PerformanceConceptInput = {
  id: string;
  name: string;

  importance: number;

  difficulty: 'FOUNDATIONAL' | 'INTERMEDIATE' | 'ADVANCED';

  mastery: PerformanceMasteryInput | null;
};

export type PerformanceEvaluationInput = {
  score: number;

  correctness: 'CORRECT' | 'PARTIAL' | 'INCORRECT';
};

export type PerformanceConceptSummary = {
  activeConceptCount: number;

  evaluatedConceptCount: number;
  unevaluatedConceptCount: number;

  averageMastery: number | null;

  totalMasteryAttempts: number;
  totalEvidenceWeight: number;

  scheduledReviewCount: number;
  dueReviewCount: number;
};

export type PerformanceAnswerSummary = {
  evaluatedAnswerCount: number;

  averageScore: number | null;

  correctness: {
    correct: number;
    partial: number;
    incorrect: number;
  };
};

export function summarizePerformanceConcepts(
  concepts: PerformanceConceptInput[],
  now: Date,
): PerformanceConceptSummary {
  const evaluated = concepts.filter(
    (concept) => concept.mastery !== null && concept.mastery.attemptCount > 0,
  );

  const masteryTotal = evaluated.reduce(
    (sum, concept) => sum + concept.mastery!.masteryScore,
    0,
  );

  const totalMasteryAttempts = concepts.reduce(
    (sum, concept) => sum + (concept.mastery?.attemptCount ?? 0),
    0,
  );

  const totalEvidenceWeight = concepts.reduce(
    (sum, concept) => sum + (concept.mastery?.evidenceWeight ?? 0),
    0,
  );

  const scheduledReviewCount = concepts.filter(
    (concept) =>
      concept.mastery?.reviewDueAt !== null &&
      concept.mastery?.reviewDueAt !== undefined,
  ).length;

  const dueReviewCount = concepts.filter((concept) => {
    const reviewDueAt = concept.mastery?.reviewDueAt;

    return (
      reviewDueAt !== null &&
      reviewDueAt !== undefined &&
      reviewDueAt.getTime() <= now.getTime()
    );
  }).length;

  return {
    activeConceptCount: concepts.length,

    evaluatedConceptCount: evaluated.length,

    unevaluatedConceptCount: concepts.length - evaluated.length,

    averageMastery:
      evaluated.length > 0 ? masteryTotal / evaluated.length : null,

    totalMasteryAttempts,
    totalEvidenceWeight,

    scheduledReviewCount,
    dueReviewCount,
  };
}

export function summarizePerformanceAnswers(
  evaluations: PerformanceEvaluationInput[],
): PerformanceAnswerSummary {
  const correctness = {
    correct: 0,
    partial: 0,
    incorrect: 0,
  };

  let scoreTotal = 0;

  for (const evaluation of evaluations) {
    validateScore(evaluation.score);

    scoreTotal += evaluation.score;

    switch (evaluation.correctness) {
      case 'CORRECT':
        correctness.correct += 1;
        break;

      case 'PARTIAL':
        correctness.partial += 1;
        break;

      case 'INCORRECT':
        correctness.incorrect += 1;
        break;
    }
  }

  return {
    evaluatedAnswerCount: evaluations.length,

    averageScore:
      evaluations.length > 0 ? scoreTotal / evaluations.length : null,

    correctness,
  };
}

function validateScore(score: number): void {
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error(`Performance received invalid evaluation score ${score}`);
  }
}
