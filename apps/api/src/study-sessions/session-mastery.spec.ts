import {
  INITIAL_SESSION_ALPHA,
  INITIAL_SESSION_ATTEMPT_COUNT,
  INITIAL_SESSION_BETA,
  INITIAL_SESSION_EVIDENCE_WEIGHT,
  INITIAL_SESSION_MASTERY_SCORE,
  SESSION_CONFIDENCE_ATTEMPT_TARGET,
  SESSION_CONFIDENCE_EVIDENCE_TARGET,
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

  it('keeps visible mastery at zero after a completely incorrect first answer', () => {
    const result = updateSessionMastery(
      {
        alpha: 1,

        beta: 1,

        masteryScore: 0,

        evidenceWeight: 0,

        attemptCount: 0,
      },
      'RECALL',
      0,
    );

    expect(result.masteryBefore).toBe(0);

    expect(result.masteryAfter).toBe(0);

    expect(result.evidenceWeightAfter).toBe(0.75);

    expect(result.attemptCountAfter).toBe(1);
  });

  it('does not treat one perfect recall answer as concept mastery', () => {
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

    /*
     * performance = 1.0
     * evidence confidence = 0.75 / 4
     * attempt confidence = 1 / 3
     *
     * mastery = 0.0625
     */
    expect(result.masteryAfter).toBeCloseTo(0.0625);

    expect(result.masteryAfter).toBeLessThan(0.1);
  });

  it('gives limited mastery after a partial first answer', () => {
    const result = updateSessionMastery(
      {
        alpha: 1,

        beta: 1,

        masteryScore: 0,

        evidenceWeight: 0,

        attemptCount: 0,
      },
      'UNDERSTANDING',
      0.5,
    );

    expect(result.masteryAfter).toBeCloseTo(1 / 24);

    expect(result.masteryAfter).toBeLessThan(0.1);
  });

  it('uses larger evidence weight for application questions', () => {
    const recall = updateSessionMastery(
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

    const application = updateSessionMastery(
      {
        alpha: 1,

        beta: 1,

        masteryScore: 0,

        evidenceWeight: 0,

        attemptCount: 0,
      },
      'APPLICATION',
      1,
    );

    expect(recall.weight).toBe(0.75);

    expect(application.weight).toBe(1.25);

    expect(application.evidenceWeightAfter).toBeGreaterThan(
      recall.evidenceWeightAfter,
    );
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
      1,
    );

    expect(second.masteryBefore).toBeCloseTo(first.masteryAfter);

    expect(second.evidenceWeightAfter).toBe(1.75);

    expect(second.attemptCountAfter).toBe(2);

    /*
     * Two perfect answers are strong evidence, but still not
     * sufficient for high concept mastery.
     */
    expect(second.masteryAfter).toBeCloseTo(0.2916666667);

    expect(second.masteryAfter).toBeLessThan(0.3);
  });

  it('allows strong mastery after recall, understanding, and application evidence', () => {
    const recall = updateSessionMastery(
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

    const understanding = updateSessionMastery(
      {
        alpha: recall.alphaAfter,

        beta: recall.betaAfter,

        masteryScore: recall.masteryAfter,

        evidenceWeight: recall.evidenceWeightAfter,

        attemptCount: recall.attemptCountAfter,
      },
      'UNDERSTANDING',
      1,
    );

    const application = updateSessionMastery(
      {
        alpha: understanding.alphaAfter,

        beta: understanding.betaAfter,

        masteryScore: understanding.masteryAfter,

        evidenceWeight: understanding.evidenceWeightAfter,

        attemptCount: understanding.attemptCountAfter,
      },
      'APPLICATION',
      1,
    );

    expect(application.evidenceWeightAfter).toBe(3);

    expect(application.attemptCountAfter).toBe(3);

    expect(application.masteryAfter).toBeCloseTo(0.75);
  });

  it('can approach complete mastery only after additional strong evidence', () => {
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
      1,
    );

    const third = updateSessionMastery(
      {
        alpha: second.alphaAfter,

        beta: second.betaAfter,

        masteryScore: second.masteryAfter,

        evidenceWeight: second.evidenceWeightAfter,

        attemptCount: second.attemptCountAfter,
      },
      'APPLICATION',
      1,
    );

    const fourth = updateSessionMastery(
      {
        alpha: third.alphaAfter,

        beta: third.betaAfter,

        masteryScore: third.masteryAfter,

        evidenceWeight: third.evidenceWeightAfter,

        attemptCount: third.attemptCountAfter,
      },
      'RECALL',
      1,
    );

    expect(fourth.evidenceWeightAfter).toBe(3.75);

    expect(fourth.attemptCountAfter).toBe(4);

    expect(fourth.masteryAfter).toBeCloseTo(0.9375);
  });

  it('uses explicit confidence targets', () => {
    expect(SESSION_CONFIDENCE_EVIDENCE_TARGET).toBe(4);

    expect(SESSION_CONFIDENCE_ATTEMPT_TARGET).toBe(3);
  });
});
