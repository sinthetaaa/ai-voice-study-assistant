import {
  INITIAL_SESSION_ALPHA,
  INITIAL_SESSION_ATTEMPT_COUNT,
  INITIAL_SESSION_BETA,
  INITIAL_SESSION_EVIDENCE_WEIGHT,
  INITIAL_SESSION_MASTERY_SCORE,
  updateSessionMastery,
} from './session-mastery';

describe('session mastery', () => {
  it('starts a fresh session at zero visible mastery', () => {
    expect(INITIAL_SESSION_ALPHA).toBe(1);

    expect(INITIAL_SESSION_BETA).toBe(1);

    expect(INITIAL_SESSION_MASTERY_SCORE).toBe(0);

    expect(INITIAL_SESSION_EVIDENCE_WEIGHT).toBe(0);

    expect(INITIAL_SESSION_ATTEMPT_COUNT).toBe(0);
  });

  it('applies recall evidence only to the current session state', () => {
    const result = updateSessionMastery(
      {
        alpha: 1,

        beta: 1,

        masteryScore: 0,

        evidenceWeight: 0,

        attemptCount: 0,
      },
      'RECALL',
      1,
    );

    expect(result.weight).toBe(0.75);

    expect(result.masteryBefore).toBe(0);

    expect(result.alphaAfter).toBe(1.75);

    expect(result.betaAfter).toBe(1);

    expect(result.evidenceWeightAfter).toBe(0.75);

    expect(result.attemptCountAfter).toBe(1);

    expect(result.masteryAfter).toBeCloseTo(1.75 / 2.75);
  });

  it('uses larger evidence weight for application questions', () => {
    const result = updateSessionMastery(
      {
        alpha: 1,

        beta: 1,

        masteryScore: 0,

        evidenceWeight: 0,

        attemptCount: 0,
      },
      'APPLICATION',
      0.8,
    );

    expect(result.weight).toBe(1.25);

    expect(result.evidenceWeightAfter).toBe(1.25);

    expect(result.attemptCountAfter).toBe(1);
  });

  it('accumulates only evidence from this session', () => {
    const first = updateSessionMastery(
      {
        alpha: 1,

        beta: 1,

        masteryScore: 0,

        evidenceWeight: 0,

        attemptCount: 0,
      },
      'RECALL',
      1,
    );

    const second = updateSessionMastery(
      {
        alpha: first.alphaAfter,

        beta: first.betaAfter,

        masteryScore: first.masteryAfter,

        evidenceWeight: first.evidenceWeightAfter,

        attemptCount: first.attemptCountAfter,
      },
      'UNDERSTANDING',
      0.5,
    );

    expect(second.evidenceWeightAfter).toBe(1.75);

    expect(second.attemptCountAfter).toBe(2);

    expect(second.masteryBefore).toBeCloseTo(first.masteryAfter);
  });
});
