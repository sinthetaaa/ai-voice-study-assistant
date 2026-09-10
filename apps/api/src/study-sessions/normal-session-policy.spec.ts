import {
  evaluateNormalSessionQuestionLimit,
  NORMAL_SESSION_MAX_QUESTION_COUNT,
  NORMAL_SESSION_TARGET_CONCEPT_COUNT,
  NORMAL_SESSION_TARGET_QUESTION_COUNT,
} from './normal-session-policy';

describe('normal session policy', () => {
  it('uses five concepts as the normal session target', () => {
    expect(NORMAL_SESSION_TARGET_CONCEPT_COUNT).toBe(5);
  });

  it('targets fifteen baseline questions', () => {
    expect(NORMAL_SESSION_TARGET_QUESTION_COUNT).toBe(15);
  });

  it('has an absolute maximum of twenty evaluated questions', () => {
    expect(NORMAL_SESSION_MAX_QUESTION_COUNT).toBe(20);
  });

  it('continues before the hard question limit', () => {
    expect(evaluateNormalSessionQuestionLimit(0)).toEqual({
      reachedLimit: false,
      answeredQuestionCount: 0,
      maximumQuestionCount: 20,
    });

    expect(evaluateNormalSessionQuestionLimit(15)).toEqual({
      reachedLimit: false,
      answeredQuestionCount: 15,
      maximumQuestionCount: 20,
    });

    expect(evaluateNormalSessionQuestionLimit(19)).toEqual({
      reachedLimit: false,
      answeredQuestionCount: 19,
      maximumQuestionCount: 20,
    });
  });

  it('stops exactly at question twenty', () => {
    expect(evaluateNormalSessionQuestionLimit(20)).toEqual({
      reachedLimit: true,
      answeredQuestionCount: 20,
      maximumQuestionCount: 20,
      reason: 'QUESTION_LIMIT_REACHED',
    });
  });

  it('also treats counts above twenty as terminal defensively', () => {
    expect(
      evaluateNormalSessionQuestionLimit(21).reachedLimit,
    ).toBe(true);
  });

  it('rejects invalid question counts', () => {
    expect(() =>
      evaluateNormalSessionQuestionLimit(-1),
    ).toThrow(
      'answeredQuestionCount must be a non-negative integer',
    );

    expect(() =>
      evaluateNormalSessionQuestionLimit(1.5),
    ).toThrow(
      'answeredQuestionCount must be a non-negative integer',
    );
  });
});
