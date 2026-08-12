import {
  ADVANCE_EVIDENCE_THRESHOLD,
  ADVANCE_MASTERY_THRESHOLD,
} from '../adaptive/adaptive-policy';

import { classifyStudyReadiness } from './study-session-readiness';

describe('classifyStudyReadiness', () => {
  it('classifies a missing mastery row as UNSEEN', () => {
    const result = classifyStudyReadiness(null);

    expect(result.state).toBe('UNSEEN');
    expect(result.needsNormalStudy).toBe(true);
    expect(result.masteryScore).toBe(0.5);
    expect(result.evidenceWeight).toBe(0);
    expect(result.attemptCount).toBe(0);
  });

  it('classifies a neutral mastery row as UNSEEN', () => {
    const result = classifyStudyReadiness({
      masteryScore: 0.5,
      evidenceWeight: 0,
      attemptCount: 0,
    });

    expect(result.state).toBe('UNSEEN');
    expect(result.needsNormalStudy).toBe(true);
  });

  it('keeps strong score with insufficient evidence in LEARNING', () => {
    const result = classifyStudyReadiness({
      masteryScore: 0.9,
      evidenceWeight: ADVANCE_EVIDENCE_THRESHOLD - 0.01,
      attemptCount: 2,
    });

    expect(result.state).toBe('LEARNING');
    expect(result.needsNormalStudy).toBe(true);
  });

  it('keeps sufficient evidence with weak mastery in LEARNING', () => {
    const result = classifyStudyReadiness({
      masteryScore: ADVANCE_MASTERY_THRESHOLD - 0.01,
      evidenceWeight: 4,
      attemptCount: 4,
    });

    expect(result.state).toBe('LEARNING');
    expect(result.needsNormalStudy).toBe(true);
  });

  it('classifies exact adaptive thresholds as MASTERED', () => {
    const result = classifyStudyReadiness({
      masteryScore: ADVANCE_MASTERY_THRESHOLD,
      evidenceWeight: ADVANCE_EVIDENCE_THRESHOLD,
      attemptCount: 3,
    });

    expect(result.state).toBe('MASTERED');
    expect(result.needsNormalStudy).toBe(false);
  });

  it('classifies strong accumulated mastery as MASTERED', () => {
    const result = classifyStudyReadiness({
      masteryScore: 0.82,
      evidenceWeight: 6,
      attemptCount: 7,
    });

    expect(result.state).toBe('MASTERED');
    expect(result.needsNormalStudy).toBe(false);
  });
});
