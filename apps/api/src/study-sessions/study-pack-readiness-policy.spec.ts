import {
  buildStudyPackPreparationSnapshot,
  determineStudyPackReadinessOverallState,
} from './study-pack-readiness-policy';

describe('Study Pack readiness policy', () => {
  it('keeps uploaded material incomplete', () => {
    const result = buildStudyPackPreparationSnapshot({
      documents: [
        {
          status: 'UPLOADED',
          conceptStatus: 'PENDING',
        },
      ],
      hierarchyStatus: 'DIRTY',
      hierarchyRevision: 0,
      hierarchyGeneratedRevision: null,
    });

    expect(result.state).toBe('INCOMPLETE');
    expect(result.documents.settled).toBe(false);
    expect(result.conceptExtraction.settled).toBe(false);
  });

  it('keeps READY material incomplete while concept extraction is pending', () => {
    const result = buildStudyPackPreparationSnapshot({
      documents: [
        {
          status: 'READY',
          conceptStatus: 'PENDING',
        },
      ],
      hierarchyStatus: 'DIRTY',
      hierarchyRevision: 1,
      hierarchyGeneratedRevision: null,
    });

    expect(result.state).toBe('INCOMPLETE');
    expect(result.documents.settled).toBe(true);
    expect(result.conceptExtraction.settled).toBe(false);
  });

  it('requires a current hierarchy revision', () => {
    const result = buildStudyPackPreparationSnapshot({
      documents: [
        {
          status: 'READY',
          conceptStatus: 'READY',
        },
      ],
      hierarchyStatus: 'READY',
      hierarchyRevision: 3,
      hierarchyGeneratedRevision: 2,
    });

    expect(result.state).toBe('INCOMPLETE');
    expect(result.hierarchy.current).toBe(false);
  });

  it('classifies a settled failed hierarchy as failed', () => {
    const result = buildStudyPackPreparationSnapshot({
      documents: [
        {
          status: 'READY',
          conceptStatus: 'FAILED',
        },
      ],
      hierarchyStatus: 'FAILED',
      hierarchyRevision: 1,
      hierarchyGeneratedRevision: null,
    });

    expect(result.state).toBe('FAILED');
    expect(result.hasWarnings).toBe(true);
  });

  it('allows partial document failure when the hierarchy is current', () => {
    const result = buildStudyPackPreparationSnapshot({
      documents: [
        {
          status: 'READY',
          conceptStatus: 'READY',
        },
        {
          status: 'FAILED',
          conceptStatus: 'FAILED',
        },
      ],
      hierarchyStatus: 'READY',
      hierarchyRevision: 4,
      hierarchyGeneratedRevision: 4,
    });

    expect(result.state).toBe('READY');
    expect(result.hasWarnings).toBe(true);
    expect(result.hierarchy.current).toBe(true);
  });

  it('does not allow an empty Study Pack to become ready', () => {
    const result = buildStudyPackPreparationSnapshot({
      documents: [],
      hierarchyStatus: 'READY',
      hierarchyRevision: 0,
      hierarchyGeneratedRevision: 0,
    });

    expect(result.state).toBe('INCOMPLETE');
  });

  it('makes preparation failure take precedence over learning state', () => {
    expect(determineStudyPackReadinessOverallState('FAILED', 10, 10)).toBe(
      'PREPARATION_FAILED',
    );
  });

  it('makes incomplete preparation take precedence over active concepts', () => {
    expect(determineStudyPackReadinessOverallState('INCOMPLETE', 10, 10)).toBe(
      'PREPARATION_INCOMPLETE',
    );
  });

  it('allows normal study after authoritative preparation is ready', () => {
    expect(determineStudyPackReadinessOverallState('READY', 10, 7)).toBe(
      'NORMAL_STUDY_AVAILABLE',
    );
  });
});
