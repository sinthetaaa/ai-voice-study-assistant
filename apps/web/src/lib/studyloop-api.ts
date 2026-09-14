const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
};

export type AuthResponse = {
  user: AuthUser;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = {
  email: string;
  password: string;
  name?: string;
};

export type ApiDocument = {
  id: string;

  studyPackId: string;

  originalName: string;

  mimeType: string;

  sizeBytes: number;

  status?: string;

  createdAt?: string;
};

export type StudyPack = {
  id: string;

  name: string;

  description?: string | null;

  goal?: string | null;

  documents: ApiDocument[];
};

export type UpdateStudyPackInput = {
  name?: string;

  description?: string | null;

  goal?: string | null;
};

export type StudyPackDocumentManagementItem = {
  id: string;

  studyPackId: string;

  originalName: string;

  mimeType: string;

  sizeBytes: number;

  status:
    | "UPLOADED"
    | "PROCESSING"
    | "READY"
    | "FAILED";

  errorMessage: string | null;

  conceptStatus:
    | "PENDING"
    | "PROCESSING"
    | "READY"
    | "FAILED";

  conceptErrorMessage: string | null;

  createdAt: string;

  updatedAt: string;
};

export type DocumentUploadRejection = {
  originalName: string;

  mimeType: string;

  sizeBytes: number;

  reason:
    | "UNSUPPORTED_TYPE"
    | "FILE_TOO_LARGE";
};

export type UploadDocumentsResult = {
  studyPackId: string;

  uploaded: number;

  documents: ApiDocument[];

  rejected: DocumentUploadRejection[];
};

export type ReadinessResult = {
  studyPackId: string;

  overallState:
    | "NO_ACTIVE_CONCEPTS"
    | "PREPARATION_INCOMPLETE"
    | "PREPARATION_FAILED"
    | "NORMAL_STUDY_AVAILABLE"
    | "NORMAL_STUDY_COMPLETE";

  preparation: {
    state:
      | "INCOMPLETE"
      | "READY"
      | "FAILED";

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
      status:
        | "DIRTY"
        | "GENERATING"
        | "READY"
        | "FAILED";

      revision: number;

      generatedRevision: number | null;

      current: boolean;
    };
  };

  counts: {
    activeConceptCount: number;

    questionReadyConceptCount: number;

    conceptsNeedingQuestionPreparation: number;

    unseenConceptCount: number;

    learningConceptCount: number;

    masteredConceptCount: number;

    normalStudyConceptCount: number;

    masteredQuestionReadyConceptCount: number;

    scheduledReviewCount: number;

    dueReviewCount: number;
  };

  questionPreparationCoverage: {
    ready: number;

    total: number;

    ratio: number;
  };
};

export type SessionMastery = {
  score: number;

  evidenceWeight: number;

  attemptCount: number;
};

export type SessionConcept = {
  id: string;

  name: string;

  difficulty: "FOUNDATIONAL" | "INTERMEDIATE" | "ADVANCED";

  importance: number;

  position: number;

  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REVIEW_REQUIRED";

  reviewRequired: boolean;

  mastery: SessionMastery;
};

export type SessionQuestion = {
  id: string;

  type: "RECALL" | "UNDERSTANDING" | "APPLICATION";

  difficulty: "EASY" | "MEDIUM" | "HARD";

  prompt: string;
};

export type ConceptGraph = {
  studyPackId: string;

  nodes: {
    id: string;

    name: string;

    difficulty: "FOUNDATIONAL" | "INTERMEDIATE" | "ADVANCED";

    importance: number;
  }[];

  edges: {
    id: string;

    sourceConceptId: string;

    targetConceptId: string;

    type: string;

    strength: number;

    reason: string | null;
  }[];
};

export type StudyPackCoverageHierarchy = {
  status: "DIRTY" | "GENERATING" | "READY" | "FAILED";
  revision: number;
  generatedRevision: number | null;
  authoritative: boolean;
};

export type StudyPackCoverageAtomicConcept = {
  id: string;
  name: string;
  importance: number;
  difficulty: "FOUNDATIONAL" | "INTERMEDIATE" | "ADVANCED";
  position: number | null;
  tested: boolean;
  evaluatedNormalAttemptCount: number;
};

export type StudyPackCoverageCoreConcept = {
  id: string;
  name: string;
  description: string;
  importance: number;
  position: number;
  coverage: {
    state: "UNTOUCHED" | "IN_PROGRESS" | "COVERED";
    ratio: number;
    atomicConceptCount: number;
    testedAtomicConceptCount: number;
    untestedAtomicConceptCount: number;
  };
  atomicConcepts: StudyPackCoverageAtomicConcept[];
};

export type StudyPackCoverageTopic = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  coreConcepts: StudyPackCoverageCoreConcept[];
};

export type StudyPackCoverage = {
  studyPackId: string;

  hierarchy: StudyPackCoverageHierarchy;

  totalCoreConceptCount: number;
  coveredCoreConceptCount: number;
  inProgressCoreConceptCount: number;
  untouchedCoreConceptCount: number;

  totalAtomicConceptCount: number;
  testedAtomicConceptCount: number;
  untestedAtomicConceptCount: number;

  ratio: number;
  weightedRatio: number;
  percentage: number;

  topics: StudyPackCoverageTopic[];
};

export type StudyPackOverviewPrimaryAction =
  | {
      type: "RESUME_NORMAL_SESSION";
      sessionId: string;
      sessionNumber: number;
    }
  | {
      type: "START_NORMAL_SESSION";
      sessionNumber: number;
    };

export type StudyPackOverviewItem = {
  studyPackId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;

  coverage: {
    authoritative: boolean;
    percentage: number | null;
    coveredCoreConceptCount: number;
    totalCoreConceptCount: number;
  };

  normalStudy: {
    sessionCount: number;
    completedSessionCount: number;

    activeSession: {
      sessionId: string;
      sessionNumber: number;
      startedAt: string;
      updatedAt: string;
      answeredQuestionCount: number;
    } | null;

    nextSessionNumber: number;
    primaryAction: StudyPackOverviewPrimaryAction;
  };

  lastStudiedAt: string | null;
};

export type StudyPackProgressConcept = {
  conceptId: string;
  name: string;
  difficulty: "FOUNDATIONAL" | "INTERMEDIATE" | "ADVANCED";
  importance: number;
  position: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REVIEW_REQUIRED";
  reviewRequired: boolean;

  mastery: {
    score: number;
    evidenceWeight: number;
    attemptCount: number;
  };

  startedAt: string | null;
  completedAt: string | null;
};

export type StudyPackProgressHistorySession = {
  sessionId: string;
  sessionNumber: number | null;
  kind: "NORMAL" | "REVIEW";
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";

  startedAt: string;
  completedAt: string | null;
  updatedAt: string;

  answeredQuestionCount: number;

  conceptCount: number;
  completedConceptCount: number;
  reviewRequiredCount: number;

  concepts: StudyPackProgressConcept[];
};

export type StudyPackProgressResult = {
  studyPack: {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  };

  coverage: {
    authoritative: boolean;
    percentage: number | null;
    coveredCoreConceptCount: number;
    totalCoreConceptCount: number;
  };

  normalStudy: {
    sessionCount: number;
    completedSessionCount: number;

    activeSession: {
      sessionId: string;
      sessionNumber: number;
      startedAt: string;

      progress: {
        completedConceptCount: number;
        reviewRequiredCount: number;
        remainingConceptCount: number;

        answeredQuestionCount: number;
        targetQuestionCount: number;
        maximumQuestionCount: number;

        remainingToTarget: number;
        remainingToMaximum: number;

        targetReached: boolean;
        maximumReached: boolean;
      };
    } | null;

    nextSessionNumber: number;
    primaryAction: StudyPackOverviewPrimaryAction;
  };

  lastStudiedAt: string | null;

  history: StudyPackProgressHistorySession[];
};

export type StudyPackPerformanceAnswerSummary = {
  evaluatedAnswerCount: number;

  averageScore: number | null;

  correctness: {
    correct: number;

    partial: number;

    incorrect: number;
  };
};

export type StudyPackPerformanceMasterySummary = {
  activeConceptCount: number;

  evaluatedConceptCount: number;

  unevaluatedConceptCount: number;

  averageMastery: number | null;

  totalMasteryAttempts: number;

  totalEvidenceWeight: number;

  scheduledReviewCount: number;

  dueReviewCount: number;
};

export type StudyPackPerformanceConcept = {
  id: string;

  name: string;

  importance: number;

  difficulty: "FOUNDATIONAL" | "INTERMEDIATE" | "ADVANCED";

  mastery: {
    score: number;

    evidenceWeight: number;

    attemptCount: number;

    reviewDueAt: string | null;

    lastReviewedAt: string | null;

    dueForReview: boolean;
  } | null;
};

export type StudyPackPerformanceSessionTrendPoint = {
  sessionId: string;

  sessionNumber: number | null;

  kind: "NORMAL" | "REVIEW";

  status: "ACTIVE" | "COMPLETED" | "ABANDONED";

  startedAt: string;

  completedAt: string | null;

  answerQuality: StudyPackPerformanceAnswerSummary;
};

export type StudyPackPerformanceTopic = {
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

export type StudyPackPerformanceCoreConcept = {
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

export type StudyPackPerformanceCoreConceptHighlight = {
  id: string;

  name: string;

  topicId: string;

  topicName: string;

  averageMastery: number;

  evaluatedAtomicConceptCount: number;

  atomicConceptCount: number;
};

export type StudyPackPerformanceResult = {
  studyPack: {
    id: string;

    name: string;
  };

  mastery: StudyPackPerformanceMasterySummary;

  answerQuality: StudyPackPerformanceAnswerSummary;

  sessionTrend: StudyPackPerformanceSessionTrendPoint[];

  hierarchy: {
    topics: StudyPackPerformanceTopic[];

    coreConcepts: StudyPackPerformanceCoreConcept[];

    strongestCoreConcept: StudyPackPerformanceCoreConceptHighlight | null;

    weakestCoreConcept: StudyPackPerformanceCoreConceptHighlight | null;
  };

  concepts: StudyPackPerformanceConcept[];
};

export type StudySession = {
  sessionId: string;

  studyPackId: string;

  kind: "NORMAL" | "REVIEW";

  status: "ACTIVE" | "COMPLETED" | "ABANDONED";

  startedAt: string;

  completedAt: string | null;

  sessionNumber: number | null;

  conceptCount: number;

  progress: {
    completedConceptCount: number;
    reviewRequiredCount: number;
    remainingConceptCount: number;

    answeredQuestionCount: number;
    targetQuestionCount: number;
    maximumQuestionCount: number;
    remainingToTarget: number;
    remainingToMaximum: number;
    targetReached: boolean;
    maximumReached: boolean;
  };

  currentConcept: SessionConcept | null;

  currentQuestion: SessionQuestion | null;

  conceptFlow: SessionConcept[];
};

export type EvaluationResult = {
  studyPackId: string;

  conceptId: string;

  questionId: string;

  studySessionId: string | null;

  attemptId: string;

  evaluationId: string;

  questionType: "RECALL" | "UNDERSTANDING" | "APPLICATION";

  difficulty: "EASY" | "MEDIUM" | "HARD";

  answerText: string;

  score: number;

  correctness: "CORRECT" | "PARTIAL" | "INCORRECT";

  feedback: string;

  missingPoints: string[];

  misconceptions: string[];

  evaluatorProvider: string;

  evaluatorModel: string;

  evaluatorVersion: string;

  createdAt: string;

  masteryStatus: "APPLIED" | "ALREADY_APPLIED" | "PENDING";

  mastery: unknown;
};

export type LearningLoopRemediation = {
  kind: "MISCONCEPTION" | "MISSING_POINTS" | "GENERAL_GAP";

  focusPoints: string[];

  explanation: string;

  keyTakeaways: string[];

  evidenceChunkIds: string[];

  generatorProvider: string;

  generatorModel: string;

  generatorVersion: string;
};

export type LearningLoopStep = {
  studyPackId: string;

  conceptId: string;

  conceptName: string;

  evaluationId: string;

  decisionVersion: string;

  action:
    | "ASK_QUESTION"
    | "REMEDIATE_AND_ASK"
    | "ADVANCE_CONCEPT"
    | "ADVANCE_WITH_REVIEW";

  reasonCode: string;

  reason: string;

  mastery: {
    score: number;

    evidenceWeight: number;
  };

  question: SessionQuestion | null;

  remediation: LearningLoopRemediation | null;

  nextQuestionType: "RECALL" | "UNDERSTANDING" | "APPLICATION" | null;

  retestQuestionType: "RECALL" | "UNDERSTANDING" | "APPLICATION" | null;

  reviewQuestionType: "RECALL" | "UNDERSTANDING" | "APPLICATION" | null;
};

export type StudySessionAnswer = {
  evaluation: EvaluationResult;

  learningStep: LearningLoopStep | null;

  reviewStep: unknown | null;

  session: StudySession;
};

export type QuestionSpeechResult = {
  sessionId: string;

  questionId: string;

  text: string;

  speech:
    | {
        status: "READY";

        mimeType: "audio/wav";

        audioBase64: string;

        model: string | null;

        speaker: string | null;

        sampleRate: number | null;

        durationSeconds: number | null;
      }
    | {
        status: "FAILED";

        mimeType: null;

        audioBase64: null;

        model: null;

        speaker: null;

        sampleRate: null;

        durationSeconds: null;
      };
};

export type AnalysisSource = {
  chunkId: string;

  documentId: string;

  documentName: string;

  mimeType: string;

  unitId: string;

  unitKind: string;

  unitLabel: string;

  unitIndex: number;

  pageNumber: number | null;

  excerpt: string;

  fileUrl: string;
};

export type AnalysisSourcesResult = {
  sessionId: string;

  attemptId: string;

  sourceCount: number;

  sources: AnalysisSource[];
};

export type VoiceAnswerResult = {
  transcription: {
    text: string;

    [key: string]: unknown;
  };

  answer: StudySessionAnswer;

  spokenResponseText: string;

  speech:
    | {
        status: "READY";

        mimeType: "audio/wav";

        audioBase64: string;

        model: string | null;

        speaker: string | null;

        sampleRate: number | null;

        durationSeconds: number | null;
      }
    | {
        status: "FAILED";

        mimeType: null;

        audioBase64: null;

        model: null;

        speaker: null;

        sampleRate: null;

        durationSeconds: null;
      };
};

export class StudyLoopApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);

    this.name = "StudyLoopApiError";

    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,

      credentials: "include",

      cache: "no-store",
    });
  } catch {
    throw new StudyLoopApiError(
      "Could not reach the StudyLoop API. Make sure the API is running on port 4000.",
      0,
    );
  }

  if (!response.ok) {
    let message = `StudyLoop API request failed (${response.status}).`;

    try {
      const body = await response.json();

      if (typeof body?.message === "string") {
        message = body.message;
      } else if (Array.isArray(body?.message)) {
        message = body.message.join(" ");
      }
    } catch {}

    throw new StudyLoopApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const studyLoopApi = {
  getCurrentUser() {
    return request<AuthResponse>("/auth/me");
  },

  login(input: LoginInput) {
    return request<AuthResponse>("/auth/login", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(input),
    });
  },

  register(input: RegisterInput) {
    return request<AuthResponse>("/auth/register", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(input),
    });
  },

  logout() {
    return request<void>("/auth/logout", {
      method: "POST",
    });
  },

  getStudyPackOverview() {
    return request<StudyPackOverviewItem[]>("/study-packs/overview");
  },

  getStudyPackProgress(studyPackId: string) {
    return request<StudyPackProgressResult>(
      `/study-packs/${encodeURIComponent(studyPackId)}/progress`,
    );
  },

  getStudyPackPerformance(studyPackId: string) {
    return request<StudyPackPerformanceResult>(
      `/study-packs/${encodeURIComponent(studyPackId)}/performance`,
    );
  },

  createStudyPack(name: string) {
    return request<StudyPack>("/study-packs", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        name,
      }),
    });
  },

  getStudyPack(studyPackId: string) {
    return request<StudyPack>(
      `/study-packs/${encodeURIComponent(studyPackId)}`,
    );
  },

  updateStudyPack(
    studyPackId: string,
    input: UpdateStudyPackInput,
  ) {
    return request<StudyPack>(
      `/study-packs/${encodeURIComponent(studyPackId)}`,
      {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(input),
      },
    );
  },

  deleteStudyPack(studyPackId: string) {
    return request<void>(
      `/study-packs/${encodeURIComponent(studyPackId)}`,
      {
        method: "DELETE",
      },
    );
  },

  getStudyPackDocuments(studyPackId: string) {
    return request<StudyPackDocumentManagementItem[]>(
      `/study-packs/${encodeURIComponent(studyPackId)}/documents`,
    );
  },

  deleteStudyPackDocument(
    studyPackId: string,
    documentId: string,
  ) {
    return request<void>(
      `/study-packs/${encodeURIComponent(
        studyPackId,
      )}/documents/${encodeURIComponent(documentId)}`,
      {
        method: "DELETE",
      },
    );
  },

  uploadDocuments(studyPackId: string, files: File[]) {
    const formData = new FormData();

    files.forEach((file) => {
      formData.append("files", file);
    });

    return request<UploadDocumentsResult>(
      `/study-packs/${encodeURIComponent(studyPackId)}/documents`,
      {
        method: "POST",

        body: formData,
      },
    );
  },

  getReadiness(studyPackId: string) {
    return request<ReadinessResult>(
      `/study-packs/${encodeURIComponent(studyPackId)}/readiness`,
    );
  },

  startStudySession(studyPackId: string) {
    return request<StudySession>(
      `/study-packs/${encodeURIComponent(studyPackId)}/sessions`,
      {
        method: "POST",
      },
    );
  },

  getConceptGraph(studyPackId: string) {
    return request<ConceptGraph>(
      `/study-packs/${encodeURIComponent(studyPackId)}/concepts/graph`,
    );
  },

  getStudyPackCoverage(studyPackId: string) {
    return request<StudyPackCoverage>(
      `/study-packs/${encodeURIComponent(studyPackId)}/coverage`,
    );
  },

  getStudySession(sessionId: string) {
    return request<StudySession>(
      `/study-sessions/${encodeURIComponent(sessionId)}`,
    );
  },

  getStudySessionAnalysisSources(sessionId: string, attemptId: string) {
    return request<AnalysisSourcesResult>(
      `/study-sessions/${encodeURIComponent(
        sessionId,
      )}/attempts/${encodeURIComponent(attemptId)}/sources`,
    );
  },

  speakStudySessionQuestion(sessionId: string) {
    return request<QuestionSpeechResult>(
      `/study-sessions/${encodeURIComponent(sessionId)}/question-speech`,
      {
        method: "POST",
      },
    );
  },

  answerStudySessionByVoice(sessionId: string, wavAudio: Blob) {
    const formData = new FormData();

    formData.append("audio", wavAudio, "answer.wav");

    return request<VoiceAnswerResult>(
      `/study-sessions/${encodeURIComponent(sessionId)}/voice-answer`,
      {
        method: "POST",

        body: formData,
      },
    );
  },
};
