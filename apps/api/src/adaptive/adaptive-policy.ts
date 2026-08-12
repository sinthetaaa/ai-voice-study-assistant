export type AdaptiveQuestionType = 'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

export type AdaptiveCorrectness = 'CORRECT' | 'PARTIAL' | 'INCORRECT';

export type AdaptiveAction =
  'ASK_QUESTION' | 'REMEDIATE' | 'ADVANCE_CONCEPT' | 'ADVANCE_WITH_REVIEW';

export type AdaptiveRemediationKind =
  'MISCONCEPTION' | 'MISSING_POINTS' | 'GENERAL_GAP';

export type AdaptiveReasonCode =
  | 'CORRECT_RECALL_ADVANCE_LEVEL'
  | 'CORRECT_UNDERSTANDING_ADVANCE_LEVEL'
  | 'CORRECT_APPLICATION_MASTERED'
  | 'CORRECT_APPLICATION_REVIEW_LATER'
  | 'PARTIAL_MISCONCEPTION'
  | 'PARTIAL_MISSING_POINTS'
  | 'PARTIAL_GENERAL_GAP'
  | 'INCORRECT_MISCONCEPTION'
  | 'INCORRECT_MISSING_POINTS'
  | 'INCORRECT_GENERAL_GAP';

export type AdaptivePolicyInput = {
  questionType: AdaptiveQuestionType;

  correctness: AdaptiveCorrectness;

  missingPoints: string[];

  misconceptions: string[];

  masteryAfter: number;

  evidenceWeightAfter: number;
};

export type AdaptivePolicyDecision = {
  action: AdaptiveAction;

  reasonCode: AdaptiveReasonCode;

  reason: string;

  nextQuestionType: AdaptiveQuestionType | null;

  retestQuestionType: AdaptiveQuestionType | null;

  remediation: {
    kind: AdaptiveRemediationKind;

    focusPoints: string[];
  } | null;
};

export const ADAPTIVE_POLICY_VERSION = 'v1';

export const ADVANCE_MASTERY_THRESHOLD = 0.7;

export const ADVANCE_EVIDENCE_THRESHOLD = 2.5;

export function decideAdaptiveAction(
  input: AdaptivePolicyInput,
): AdaptivePolicyDecision {
  validateInput(input);

  if (input.correctness === 'CORRECT') {
    return decideCorrect(input);
  }

  if (input.correctness === 'PARTIAL') {
    return decidePartial(input);
  }

  return decideIncorrect(input);
}

function decideCorrect(input: AdaptivePolicyInput): AdaptivePolicyDecision {
  if (input.questionType === 'RECALL') {
    return {
      action: 'ASK_QUESTION',

      reasonCode: 'CORRECT_RECALL_ADVANCE_LEVEL',

      reason: 'Recall is correct, so move to an understanding-level check.',

      nextQuestionType: 'UNDERSTANDING',

      retestQuestionType: null,

      remediation: null,
    };
  }

  if (input.questionType === 'UNDERSTANDING') {
    return {
      action: 'ASK_QUESTION',

      reasonCode: 'CORRECT_UNDERSTANDING_ADVANCE_LEVEL',

      reason:
        'Understanding is correct, so move to an application-level check.',

      nextQuestionType: 'APPLICATION',

      retestQuestionType: null,

      remediation: null,
    };
  }

  const hasEnoughEvidence =
    input.evidenceWeightAfter >= ADVANCE_EVIDENCE_THRESHOLD;

  const hasStrongMastery = input.masteryAfter >= ADVANCE_MASTERY_THRESHOLD;

  if (hasEnoughEvidence && hasStrongMastery) {
    return {
      action: 'ADVANCE_CONCEPT',

      reasonCode: 'CORRECT_APPLICATION_MASTERED',

      reason:
        'The learner answered the application-level check correctly and has sufficient accumulated mastery evidence.',

      nextQuestionType: null,

      retestQuestionType: null,

      remediation: null,
    };
  }

  return {
    action: 'ADVANCE_WITH_REVIEW',

    reasonCode: 'CORRECT_APPLICATION_REVIEW_LATER',

    reason:
      'The application-level answer is correct, but accumulated mastery evidence is not yet strong enough to consider the concept securely mastered.',

    nextQuestionType: null,

    retestQuestionType: 'APPLICATION',

    remediation: null,
  };
}

function decidePartial(input: AdaptivePolicyInput): AdaptivePolicyDecision {
  if (input.misconceptions.length > 0) {
    return {
      action: 'REMEDIATE',

      reasonCode: 'PARTIAL_MISCONCEPTION',

      reason:
        'The answer shows partial understanding but also contains a specific misconception that should be corrected before retesting.',

      nextQuestionType: input.questionType,

      retestQuestionType: input.questionType,

      remediation: {
        kind: 'MISCONCEPTION',

        focusPoints: input.misconceptions,
      },
    };
  }

  if (input.missingPoints.length > 0) {
    return {
      action: 'REMEDIATE',

      reasonCode: 'PARTIAL_MISSING_POINTS',

      reason:
        'The learner has relevant understanding but omitted important ideas required by the question.',

      nextQuestionType: input.questionType,

      retestQuestionType: input.questionType,

      remediation: {
        kind: 'MISSING_POINTS',

        focusPoints: input.missingPoints,
      },
    };
  }

  return {
    action: 'REMEDIATE',

    reasonCode: 'PARTIAL_GENERAL_GAP',

    reason:
      'The answer is only partially correct, so the concept should be reinforced before another check at the same level.',

    nextQuestionType: input.questionType,

    retestQuestionType: input.questionType,

    remediation: {
      kind: 'GENERAL_GAP',

      focusPoints: [],
    },
  };
}

function decideIncorrect(input: AdaptivePolicyInput): AdaptivePolicyDecision {
  const nextQuestionType = easierQuestionType(input.questionType);

  if (input.misconceptions.length > 0) {
    return {
      action: 'REMEDIATE',

      reasonCode: 'INCORRECT_MISCONCEPTION',

      reason:
        'The answer contains a specific misconception. Correct it, then use an easier check when possible before retesting the original level.',

      nextQuestionType,

      retestQuestionType: input.questionType,

      remediation: {
        kind: 'MISCONCEPTION',

        focusPoints: input.misconceptions,
      },
    };
  }

  if (input.missingPoints.length > 0) {
    return {
      action: 'REMEDIATE',

      reasonCode: 'INCORRECT_MISSING_POINTS',

      reason:
        'The answer is incorrect and misses important knowledge. Reinforce those ideas, then use an easier check when possible before retesting.',

      nextQuestionType,

      retestQuestionType: input.questionType,

      remediation: {
        kind: 'MISSING_POINTS',

        focusPoints: input.missingPoints,
      },
    };
  }

  return {
    action: 'REMEDIATE',

    reasonCode: 'INCORRECT_GENERAL_GAP',

    reason:
      'The learner did not demonstrate sufficient understanding. Reinforce the concept and step down one question level when possible.',

    nextQuestionType,

    retestQuestionType: input.questionType,

    remediation: {
      kind: 'GENERAL_GAP',

      focusPoints: [],
    },
  };
}

function easierQuestionType(
  questionType: AdaptiveQuestionType,
): AdaptiveQuestionType {
  if (questionType === 'APPLICATION') {
    return 'UNDERSTANDING';
  }

  if (questionType === 'UNDERSTANDING') {
    return 'RECALL';
  }

  return 'RECALL';
}

function validateInput(input: AdaptivePolicyInput): void {
  if (
    !Number.isFinite(input.masteryAfter) ||
    input.masteryAfter < 0 ||
    input.masteryAfter > 1
  ) {
    throw new Error('Adaptive policy received invalid masteryAfter');
  }

  if (
    !Number.isFinite(input.evidenceWeightAfter) ||
    input.evidenceWeightAfter < 0
  ) {
    throw new Error('Adaptive policy received invalid evidenceWeightAfter');
  }
}
