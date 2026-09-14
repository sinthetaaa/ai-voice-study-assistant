export type StudyPackReadinessOverallState =
  | 'NO_ACTIVE_CONCEPTS'
  | 'PREPARATION_INCOMPLETE'
  | 'PREPARATION_FAILED'
  | 'NORMAL_STUDY_AVAILABLE'
  | 'NORMAL_STUDY_COMPLETE';

export type StudyPackPreparationState = 'INCOMPLETE' | 'READY' | 'FAILED';

export type StudyPackPreparationSnapshot = {
  state: StudyPackPreparationState;
  hasWarnings: boolean;

  documents: {
    total: number;
    uploaded: number;
    processing: number;
    ready: number;
    failed: number;
    settled: boolean;
  };

  conceptExtraction: {
    pending: number;
    processing: number;
    ready: number;
    failed: number;
    settled: boolean;
  };

  hierarchy: {
    status: 'DIRTY' | 'GENERATING' | 'READY' | 'FAILED';
    revision: number;
    generatedRevision: number | null;
    current: boolean;
  };
};

type PreparationDocument = {
  status: 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';

  conceptStatus: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
};

type PreparationInput = {
  documents: PreparationDocument[];

  hierarchyStatus: 'DIRTY' | 'GENERATING' | 'READY' | 'FAILED';

  hierarchyRevision: number;

  hierarchyGeneratedRevision: number | null;
};

export function buildStudyPackPreparationSnapshot(
  input: PreparationInput,
): StudyPackPreparationSnapshot {
  const materialUploaded = input.documents.filter(
    (document) => document.status === 'UPLOADED',
  ).length;

  const materialProcessing = input.documents.filter(
    (document) => document.status === 'PROCESSING',
  ).length;

  const materialReady = input.documents.filter(
    (document) => document.status === 'READY',
  ).length;

  const materialFailed = input.documents.filter(
    (document) => document.status === 'FAILED',
  ).length;

  const conceptPending = input.documents.filter(
    (document) => document.conceptStatus === 'PENDING',
  ).length;

  const conceptProcessing = input.documents.filter(
    (document) => document.conceptStatus === 'PROCESSING',
  ).length;

  const conceptReady = input.documents.filter(
    (document) => document.conceptStatus === 'READY',
  ).length;

  const conceptFailed = input.documents.filter(
    (document) => document.conceptStatus === 'FAILED',
  ).length;

  const documentsSettled = materialUploaded === 0 && materialProcessing === 0;

  const conceptExtractionSettled =
    conceptPending === 0 && conceptProcessing === 0;

  const hierarchyCurrent =
    input.hierarchyStatus === 'READY' &&
    input.hierarchyGeneratedRevision === input.hierarchyRevision;

  let state: StudyPackPreparationState;

  if (
    input.documents.length === 0 ||
    !documentsSettled ||
    !conceptExtractionSettled
  ) {
    state = 'INCOMPLETE';
  } else if (input.hierarchyStatus === 'FAILED') {
    state = 'FAILED';
  } else if (!hierarchyCurrent) {
    state = 'INCOMPLETE';
  } else {
    state = 'READY';
  }

  return {
    state,

    hasWarnings: materialFailed > 0 || conceptFailed > 0,

    documents: {
      total: input.documents.length,
      uploaded: materialUploaded,
      processing: materialProcessing,
      ready: materialReady,
      failed: materialFailed,
      settled: documentsSettled,
    },

    conceptExtraction: {
      pending: conceptPending,
      processing: conceptProcessing,
      ready: conceptReady,
      failed: conceptFailed,
      settled: conceptExtractionSettled,
    },

    hierarchy: {
      status: input.hierarchyStatus,
      revision: input.hierarchyRevision,
      generatedRevision: input.hierarchyGeneratedRevision,
      current: hierarchyCurrent,
    },
  };
}

export function determineStudyPackReadinessOverallState(
  preparationState: StudyPackPreparationState,
  activeConceptCount: number,
  normalStudyConceptCount: number,
): StudyPackReadinessOverallState {
  if (preparationState === 'FAILED') {
    return 'PREPARATION_FAILED';
  }

  if (preparationState !== 'READY') {
    return 'PREPARATION_INCOMPLETE';
  }

  if (activeConceptCount === 0) {
    return 'NO_ACTIVE_CONCEPTS';
  }

  if (normalStudyConceptCount > 0) {
    return 'NORMAL_STUDY_AVAILABLE';
  }

  return 'NORMAL_STUDY_COMPLETE';
}
