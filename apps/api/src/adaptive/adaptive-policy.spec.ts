import { decideAdaptiveAction } from './adaptive-policy';

describe('decideAdaptiveAction', () => {
  it('moves correct recall to understanding', () => {
    const result = decideAdaptiveAction({
      questionType: 'RECALL',

      correctness: 'CORRECT',

      missingPoints: [],
      misconceptions: [],

      masteryAfter: 0.58,

      evidenceWeightAfter: 1.75,
    });

    expect(result.action).toBe('ASK_QUESTION');

    expect(result.nextQuestionType).toBe('UNDERSTANDING');
  });

  it('remediates missing points for a partial answer', () => {
    const result = decideAdaptiveAction({
      questionType: 'UNDERSTANDING',

      correctness: 'PARTIAL',

      missingPoints: [
        'Explain the complementary strengths of both feature types.',
      ],

      misconceptions: [],

      masteryAfter: 0.48,

      evidenceWeightAfter: 1,
    });

    expect(result.action).toBe('REMEDIATE');

    expect(result.remediation?.kind).toBe('MISSING_POINTS');

    expect(result.retestQuestionType).toBe('UNDERSTANDING');
  });

  it('prioritizes misconceptions over missing points', () => {
    const result = decideAdaptiveAction({
      questionType: 'APPLICATION',

      correctness: 'INCORRECT',

      missingPoints: ['Explain feature fusion.'],

      misconceptions: ['HFFN is incorrectly confused with image enhancement.'],

      masteryAfter: 0.35,

      evidenceWeightAfter: 2,
    });

    expect(result.remediation?.kind).toBe('MISCONCEPTION');

    expect(result.nextQuestionType).toBe('UNDERSTANDING');

    expect(result.retestQuestionType).toBe('APPLICATION');
  });

  it('advances after strong application evidence', () => {
    const result = decideAdaptiveAction({
      questionType: 'APPLICATION',

      correctness: 'CORRECT',

      missingPoints: [],
      misconceptions: [],

      masteryAfter: 0.76,

      evidenceWeightAfter: 3,
    });

    expect(result.action).toBe('ADVANCE_CONCEPT');
  });

  it('advances with review when application is correct but evidence is weak', () => {
    const result = decideAdaptiveAction({
      questionType: 'APPLICATION',

      correctness: 'CORRECT',

      missingPoints: [],
      misconceptions: [],

      masteryAfter: 0.62,

      evidenceWeightAfter: 1.25,
    });

    expect(result.action).toBe('ADVANCE_WITH_REVIEW');

    expect(result.retestQuestionType).toBe('APPLICATION');
  });
});
